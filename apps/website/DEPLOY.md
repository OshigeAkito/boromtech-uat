# Deploying the website (Cloudflare)

The site is a Cloudflare Worker, `boromtech-website` ([wrangler.toml](wrangler.toml)), that serves `dist/` as static
assets on boromtech.com. [worker.mjs](worker.mjs) runs only for `/` and sends first-time visitors to `/en/`, `/vi/` or
`/zh/` (it replaces Vercel's `middleware.js`). Built images go to the R2 bucket `bt-public` at
https://media.boromtech.com (`build.assetsPrefix` in [astro.config.mjs](astro.config.mjs)). JS, fonts and the video
stay on the site's own origin.

Every push to main that touches `apps/website/**` runs [.github/workflows/website.yml](../../.github/workflows/website.yml):
build → copy check → upload images to R2 → `wrangler deploy`. From a laptop, after `npx wrangler login`:
`npm run deploy -w apps/website`.

## Human steps, once

Do steps 1–3 before merging. Until they're done, the workflow's first run will fail: the image upload has no
bucket or permission, and the custom domain has no zone to attach to. If it does fail, re-run it by hand afterwards.

1. **Domain.** On 2026-10-20 boromtech.com was not registered: Verisign's RDAP returned 404 for it, while
   google.com returned 200 in the same check. Register it before anyone else does. Cloudflare Registrar sells .com
   at cost and puts the zone on Cloudflare straight away, so there are no nameservers to move. With another
   registrar, add boromtech.com to Cloudflare (Free plan) and set the registrar's nameservers to Cloudflare's.
   The site now advertises hello@boromtech.com, so set up mail too (MX plus SPF/DKIM/DMARC, for example with
   Google Workspace or Cloudflare Email Routing). boromtech.co was also NXDOMAIN. It's worth buying as well and
   redirecting to .com (301), so typos and old links still arrive.
2. **R2.** Create `bt-public` if it isn't there yet (`apps/job-board/infra/setup-r2.sh` on `crew-cloudflare-neon`, or
   `npx wrangler r2 bucket create bt-public --location apac`). Then connect the custom domain, which needs the zone
   from step 1: R2 → bt-public → Settings → Custom Domains → `media.boromtech.com`. Leave the r2.dev URL off.
3. **Token.** The `production` GitHub environment needs secret `CLOUDFLARE_API_TOKEN` and variable
   `CLOUDFLARE_ACCOUNT_ID`. The token needs Account › Workers Scripts: Edit, Account › Workers R2 Storage: Edit,
   Zone (boromtech.com) › Workers Routes: Edit and Zone › DNS: Edit (the custom domain creates its own DNS record).
   If the job board shares this token, it also needs what that job board's deploy needs. The job board on
   `crew-cloudflare-neon` still says crew.boromtech.co: move it to crew.boromtech.com in that branch.
4. **www (optional).** The site doesn't link to www, and www isn't routed to the Worker. To catch it, add a proxied
   `www` AAAA `100::` record and a Redirect Rule: www.boromtech.com/* → https://boromtech.com/${1}, 301, keep the query string.
5. **First deploy and check.** Merge, or run the workflow by hand. Then check https://boromtech.com with an English
   browser (it should redirect to /en/), check that images load from media.boromtech.com with
   `cache-control: public, max-age=31536000, immutable`, and run Lighthouse (mobile) against the live site.
6. **Retire Vercel.** Once the Cloudflare site checks out, delete the Vercel project. The local `.vercel/` folder
   can go too.

## Worth knowing

- Every image is `loading="lazy"` and below the fold. If Lighthouse reports the `media.boromtech.com` preconnect as
  unused, change it to `dns-prefetch` in `src/layouts/Base.astro`.
- Image keys are content-hashed and never deleted from R2, so pages still cached in browsers keep working. Storage
  grows by a few MB for each photo change.
- The video (`public/media/*.webm`, 2.2 MB) stays a Workers asset, well under the 25 MiB per-file cap. Its only
  metadata is an encoder tag. If a large video moves to R2 later, run `ffmpeg -map_metadata -1` on it once and
  commit the stripped file.
- Unknown paths return a bare 404, because the site has no 404 page. To get one, add `src/pages/404.astro` and set
  `not_found_handling = "404-page"`.
- Merging with `crew-cloudflare-neon` will conflict in `package-lock.json`, since both branches add wrangler. Run
  `npm install` after the merge to fix it. Both workflows can live side by side: this branch adds only `website.yml`.
