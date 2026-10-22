# BoromTech Crew (job board)

Invite-only board where freelancers claim tasks from client jobs, submit links, photos and files, get graded,
and get paid. Runs for about $0/month at pilot scale on Cloudflare, Google Cloud Run, Neon Postgres and R2.

## How it fits together

```
browser ── crew.boromtech.com  (Cloudflare Worker "boromtech-crew", edge/)
             ├─ /*            SPA from web/dist (static assets: unmetered, Worker code never runs)
             └─ /api, /api/*  edge/src/index.ts streams the request to Cloud Run with X-BT-Edge
                                └─► crew-api (Go on Cloud Run, asia-southeast1, api/)
                                       ├─ pgx ─► Neon (pooled) as bt_gateway: select gate.*(…) ← decides everything
                                       └─ SigV4 ─► R2 bt-crew-files: sign URLs, measure uploads, copy avatars
browser ── PUT with a signed URL ──► R2 directly    (upload bytes never pass through Cloud Run)
browser ── <img src=/api/files/ID> ─► 302 to a signed R2 URL, cached for an hour

GitHub Actions, nightly: pg_dump as bt_backup | age ─► R2 bt-backups · file copy ─► bt-backups · sweep as bt_sweeper
```

- **Postgres is the server.** `db/api.sql` holds the state machine (`lib.transitions()`), one function per
  command (`cmd.*`), what each viewer may see (`lib.*_json`, `lib.file_visible`), upload limits
  (`lib.file_rules`) and sessions. It is dropped and rebuilt on every deploy, so production always equals the
  file. Tables and CHECK constraints live in `db/migrations/`.
- **Go is a transport.** `api/` runs Google sign-in, forwards request bodies to `gate.call`, signs the R2
  URLs Postgres asks for, and reports what it measured on uploaded objects. It never decides who may do what.
  `bt_gateway` can execute the `gate.*` functions and nothing else; `db/assert_privileges.sql` fails every
  migrate (CI and deploy) if a role can reach more than its allowlist.
- **The Worker keeps one origin.** The SPA and `/api` share `crew.boromtech.com`, so cookies stay
  `__Host-` and `SameSite=Strict`, with no CORS on the API.
- **The SPA talks through `web/src/api.ts`:** `useBoard()`, `run(name, args)`, `upload(file, kind)`,
  `signIn()`, `signOut()`, `ApiError`. Every response carries the rows changed since the client's cursor.
  Tabs poll every 10 s while visible and in use, and stop when idle so Neon and Cloud Run can sleep.
- **`packages/domain`** holds the shared types and the TS copies of the SQL lists (statuses, actions,
  command names, error codes, upload rules). The db tests fail CI if they drift.

Adding a command: write `cmd.<name>` in `db/api.sql` and add its key to `packages/domain/src/commands.ts`.

## Files and images

One table, `app.files`, holds submission files, admin briefs and profile photos. The bytes live in R2.

1. **Upload.** The browser redraws images through a canvas, which drops EXIF and GPS, caps them at 2560 px
   and makes a 480 px thumbnail (`web/src/prepare.ts`). `POST /api/files` asks Postgres (`gate.upload`),
   which checks the uploader's role, type, size and a daily quota, and returns signed PUT URLs for the exact
   type, length and MD5. The browser PUTs straight to R2. Because the MD5 is signed, storage refuses any other
   bytes, so a URL that's still valid after verification can't swap the file.
2. **Verify.** `POST /api/files/{id}/done`: Go reads the stored object (size, magic bytes, and for JPEG the
   segments before the image data) and reports the facts to `gate.upload_done`. A file whose size, type or
   leftover metadata doesn't match is marked failed. Only verified files can be attached.
3. **Attach.** `submit_task` (with `fileIds`) or `attach_files` makes files visible. `detach_file` hides them.
4. **View.** `GET /api/files/{id}` asks `gate.file`, which applies `lib.file_visible` (the same rule the
   board uses to list files), then redirects to a signed R2 URL that stays the same for an hour.
5. **Profile photos** are copied from Google into R2 at sign-in, once per picture.
6. **Sweep.** Nightly, files never attached or detached 30+ days ago are deleted from R2. Attached files
   can never be deleted (`never_purge_attached` CHECK).

The JPEG and PNG metadata the browser strips and the Go check rejects are one list kept in two places
(`web/src/prepare.ts` and `api/internal/facts/facts.go`); change both together.

## Cold start

Cloud Run and Neon both scale to zero. The first request after a long idle wakes both. Measured locally: the
Go binary answers in about 8 ms after launch and a cold container in 130–172 ms; the image is 4.8 MB. The
other numbers are estimates to check against Cloud Run's startup metric after the first deploy.

| Stage | Estimate | What keeps it small |
|---|---|---|
| Cloud Run starts an instance | 200–500 ms | 4.8 MB static image on distroless, gen1, startup CPU boost |
| Go process to listening | ~10 ms | no init I/O; the DB connection is dialled in the background |
| Neon resumes | 500–1000 ms | can't be shrunk on the free plan; started early by `/api/warm` |
| Warm request | 60–80 ms | pooled connection, one SQL statement per request |

`web/index.html` preloads `/api/warm` while the JavaScript downloads. With a session cookie it wakes Cloud
Run and Neon in parallel, so a returning member waits roughly 0.5 s on the first load of the day instead of
1–1.5 s. Nothing pings on a timer and `min-instances` stays 0.

## Behavior changes from the Firebase pilot

All deliberate, each a few lines of SQL to undo:

- Admins can't claim tasks (the UI already hid it; the rules allowed it).
- Freelancers need a Google-verified email, like admins.
- Freelancers don't see other members' emails, other people's submissions (links, notes, files) or review
  feedback. Grades, payouts and statuses stay visible for the leaderboard.
- A joined freelancer can be removed: they're signed out at once, their unfinished tasks reopen and those
  tasks' in-progress files are hidden.
- A task's freelancer deadline can't be after its job's client deadline.
- The admin list is the `app.admin_allowlist` table, not a constant in two places.

## Local development

Tests need Docker:

```bash
docker run -d --name bt-pg -e POSTGRES_PASSWORD=owner -p 55432:5432 postgres:17
OWNER_URL=postgres://postgres:owner@localhost:55432/postgres npm test -w job-board-db
npm test -w job-board
```

The Go integration tests also need an S3-compatible store that checks signatures:

```bash
docker run -d --name bt-s3 -p 59000:8333 -v "$PWD/apps/job-board/api/testdata:/cfg" chrislusf/seaweedfs:4.48 server -s3 -s3.config=/cfg/s3.json -dir=/data
```

Then migrate a database called `bt_go`, set `bt_gateway` and `bt_sweeper` passwords to `test`, and run
`TEST_DATABASE_URL=postgres://postgres:owner@localhost:55432/bt_go TEST_R2_ENDPOINT=http://localhost:59000 go test ./...`
in `api/` (`.github/workflows/ci.yml` does exactly this).

To run the app, copy `api/.env.example` to `api/.env`, fill in a Google OAuth client, and run:

```bash
npm run job-board:dev
```

Vite serves http://localhost:5173 and proxies `/api` to the Go service on :8080. The Worker isn't needed
locally. Uploads need the R2 settings in `api/.env` (a dev bucket, or the seaweedfs store above).

## First production setup (human steps, once)

1. **Neon:** create the project in `aws-ap-southeast-1` (Singapore). Copy the `neondb_owner` direct
   connection string. Don't create roles in the console: migrations create `bt_gateway`, `bt_backup` and
   `bt_sweeper` in SQL, because console roles inherit `neon_superuser` and could read every table. Migrate
   once from your machine with `DATABASE_URL='<owner url>' npm run job-board:db`, then in the Neon SQL editor
   set a password for each of the three roles (`alter role bt_gateway password '…'`).
2. **Google OAuth client** (Web): redirect URIs `https://crew.boromtech.com/api/auth/callback` and
   `http://localhost:5173/api/auth/callback`.
3. **R2:** enable R2 in the Cloudflare dashboard, then run `infra/setup-r2.sh` (buckets, CORS, backup lock and
   lifecycle) and create the four API tokens it lists.
4. **Google Cloud:** create a project and link billing in the console, then
   `PROJECT=… REPO=Borom-Tech/boromtech infra/setup-gcp.sh` (Artifact Registry, service accounts, Workload
   Identity for GitHub, the four runtime secrets). Add a $1 budget alert.
5. **Cloudflare:** add the `boromtech.com` zone (move nameservers). Create an API token from the "Edit
   Cloudflare Workers" template. In `edge/`, run `npx wrangler secret put EDGE_KEY` with the same value as the
   `crew-edge-key` secret.
6. **GitHub** (Settings → Secrets and variables → Actions): the secrets and variables listed at the top of
   `.github/workflows/deploy.yml` and `backup.yml`. Generate an age key pair (`age-keygen`) for backups and
   keep the private key offline.
7. Push to `main` (or run the deploy workflow), sign in at https://crew.boromtech.com as the admin, re-invite
   freelancers, then delete the Firebase project `job-board-pilot-pw`.

## Cost at pilot scale

| Piece | Job | Free allowance | Pilot use |
|---|---|---|---|
| Cloudflare Workers | SPA assets + `/api` proxy | assets unmetered; 100k requests/day | ~5k/day |
| Cloud Run | Go API | 2M requests, 180k vCPU-s per month (verify for asia-southeast1) | ~10% (10 s polls are billed 100 ms each) |
| Neon | all data and rules | 0.5 GB; ~100 compute-hours/month (verify) | awake only while someone is active |
| R2 | files, backups | 10 GB, ~1M writes and ~10M reads/month, free egress | well under 1 GB |
| GitHub Actions | CI, deploy, backup | 2,000 min/month (private repo) | ~400 min |

**First thing to cost money:** a few cents a month of Google Cloud egress (API responses leaving Singapore).
The first real bill is still Neon compute, once someone is active across ~13+ hours a day. Cloud Run's free
compute lasts to roughly 5,000 active user-hours a month.

## Not done yet, or to verify after the first deploy

- Measure the cold start with Cloud Run's startup latency metric and check it against the table above.
- Confirm the Cloud Run free tier applies in asia-southeast1, and that an idle pooled connection doesn't
  keep Neon from suspending.
- Try uploads on real Safari and Firefox (desktop and iOS); only Chromium was exercised.
- Marketing-site images go to the `bt-public` bucket at `media.boromtech.com` when the website moves to
  Cloudflare.
- `isOnTime` still measures deadlines at UTC midnight, not Bangkok.
