# BoromTech Crew (job board)

Invite-only board where freelancers claim, submit and get graded on tasks from client jobs.
Runs for $0/month at pilot scale on Cloudflare Workers + Neon Postgres, with nightly backups to Backblaze B2.

## How it fits together

```
browser ──► crew.boromtech.co  (one Cloudflare Worker: boromtech-crew)
              ├─ /*      static SPA from web/dist  (unmetered, Worker code never runs)
              └─ /api/*  gateway/src/index.ts ──HTTPS──► Neon: select gate.call(session, body)
                                                              └─ db/api.sql decides everything
GitHub Actions ── nightly pg_dump as bt_backup | age ──► B2 bucket
```

- **Postgres is the server.** `db/api.sql` holds the state machine (`lib.transitions()`), one function per
  command (`cmd.*`), what each viewer may see (`lib.*_json`), and sessions. It is dropped and rebuilt on every
  deploy, so production always equals the file. Tables and CHECK constraints live in `db/migrations/`.
- **The gateway is dumb on purpose.** It runs Google sign-in, then forwards the request body to
  `gate.call`. It knows no command names, roles or tables. The `bt_gateway` role can execute `gate.sign_in`,
  `gate.call` and `gate.sign_out` and nothing else; `db/assert_privileges.sql` fails the deploy otherwise.
- **The SPA talks through `web/src/api.ts`:** `useBoard()`, `run(name, args)`, `signIn()`, `signOut()`,
  `ApiError`. Every response carries the rows changed since the client's cursor. Tabs poll every 10 s
  while visible and in use, and stop when idle so Neon can sleep.
- **`packages/domain`** holds the shared types and the TS copies of the SQL lists (statuses, actions,
  command names, error codes). `db/test/contract.test.ts` fails CI if they drift.

Adding a command: write `cmd.<name>` in `db/api.sql` and add its key to `packages/domain/src/commands.ts`.

## Behavior changes from the Firebase pilot

All deliberate, each a few lines of SQL to undo:

- Admins can't claim tasks (the UI already hid it; the rules allowed it).
- Freelancers need a Google-verified email, like admins.
- Freelancers no longer see other members' emails, other people's submission links or review feedback.
  Grades, payouts and statuses stay visible for the leaderboard. (`lib.member_json`, `lib.task_json`)
- A joined freelancer can be removed: they're signed out at once and their unfinished tasks reopen.
- A task's freelancer deadline can't be after its job's client deadline.
- The admin list is the `app.admin_allowlist` table, not a constant in two places.

## Local development

Tests need only Docker:

```bash
docker run -d --name bt-pg -e POSTGRES_PASSWORD=owner -p 55432:5432 postgres:17
OWNER_URL=postgres://postgres:owner@localhost:55432/postgres npm test -w job-board-db
npm test -w job-board
```

Running the app needs a Google OAuth client and a database (a Neon `dev` branch, or docker Postgres
behind `local-neon-http-proxy`). Copy `gateway/.dev.vars.example` to `gateway/.dev.vars`, then:

```bash
npm run job-board:dev
```

Vite serves http://localhost:5173 and proxies `/api` to the Worker on :8787.

## First production setup (human steps, once)

1. **Neon:** create the project in `aws-ap-southeast-1` (Singapore). Copy the `neondb_owner` direct
   connection string. Do **not** create roles in the console: the first migration creates `bt_gateway` and
   `bt_backup` in SQL, because console roles inherit `neon_superuser` and could read every table.
2. **GitHub** (Borom-Tech/boromtech → Settings → Secrets and variables → Actions): secret `NEON_OWNER_URL`.
   Migrate once from your machine with `DATABASE_URL='<owner url>' npm run job-board:db` (the deploy
   workflow would migrate too, then fail at the Cloudflare step until step 4). Then in the Neon SQL editor set
   `alter role bt_gateway password '…'` and `alter role bt_backup password '…'`.
3. **Google Cloud console:** OAuth client (Web). Redirect URIs `https://crew.boromtech.co/api/auth/callback`
   and `http://localhost:5173/api/auth/callback`. Put the client ID in `gateway/wrangler.toml`.
4. **Cloudflare:** add the `boromtech.co` zone (move nameservers). Create an API token from the
   "Edit Cloudflare Workers" template. In `apps/job-board/gateway`:
   `npx wrangler secret put DATABASE_URL` (bt_gateway, **pooled** host) and
   `npx wrangler secret put GOOGLE_CLIENT_SECRET`. GitHub: secret `CLOUDFLARE_API_TOKEN`, variable
   `CLOUDFLARE_ACCOUNT_ID`. Re-run the deploy workflow.
5. **B2:** private bucket with Object Lock and a 30-day lifecycle; an application key limited to that bucket
   with `writeFiles` only. Generate an age key pair (`age-keygen`), keep the private key offline. GitHub:
   secrets `NEON_BACKUP_URL` (bt_backup, direct host), `B2_KEY_ID`, `B2_APP_KEY`; variables
   `BACKUP_AGE_RECIPIENT`, `B2_BUCKET`, `B2_REGION`. Run the backup workflow once by hand.
6. Sign in at https://crew.boromtech.co as the admin, re-invite freelancers, then delete the Firebase
   project `job-board-pilot-pw`.

## Cost at pilot scale

| Piece | Job | Free allowance | Pilot use |
|---|---|---|---|
| Cloudflare Workers | SPA assets + `/api` | assets unmetered; 100k requests/day | ~5 users × a few hours of 10 s polls ≈ 5k/day |
| Neon | all data and rules | 0.5 GB; ~100 compute-hours/month (verify) | MBs; awake only while someone is active |
| Backblaze B2 | encrypted nightly dumps | 10 GB | < 1 MB/night, 30 days kept |
| GitHub Actions | CI, deploy, backup | 2,000 min/month (private repo) | ~300 min |

**First thing to cost money:** Neon compute, once someone is active across ~13+ hours a day. Next is the
Workers 100k requests/day limit at roughly 25 always-active tabs; Workers Paid is $5/month.

**Why no Cloud Run:** nothing here needs a Node runtime, long-lived connections or more than Workers' CPU
budget, and Cloud Run would add a GCP billing account, a second deploy target and a cold start stacked on
Neon's. It's the escape hatch: `handle()` in `gateway/src/index.ts` runs under any Node server with `pg` in
place of `neon()`, and nothing in `api.sql` changes. Reach for it for CPU-heavy or Node-only work
(PDF invoices, a Thai e-tax or payment SDK).

## Not done yet

- The marketing website still deploys to Vercel; it moves to Cloudflare once its locale work lands.
- Live updates poll. A Durable Object that pings tabs on change would let idle-but-open tabs cost nothing.
- `isOnTime` still measures deadlines at UTC midnight, not Bangkok.
