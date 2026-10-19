# Deploying the website (Cloudflare)

The site is a Cloudflare Worker, `boromtech-website` ([wrangler.toml](wrangler.toml)), that serves `dist/` as static
assets. [worker.mjs](worker.mjs) runs only for `/` and sends first-time visitors to `/en/`, `/vi/` or `/zh/` (it
replaces Vercel's `middleware.js`). JS, fonts and the video always stay on the site's own origin.

It deploys in one of two modes. **`MEDIA_ORIGIN`** is the switch between them:

| | workers.dev (now) | production (once boromtech.com is on Cloudflare) |
|---|---|---|
| URL | `boromtech-website.<account>.workers.dev` | https://boromtech.com (custom domain; workers.dev turned off) |
| Images | inside the Worker's static assets | R2 `bt-public` at https://media.boromtech.com (`build.assetsPrefix`) |
| Laptop (`apps/website`, after `npx wrangler login`) | `npm run deploy` | `npm run deploy:production` |
| CI ([website.yml](../../.github/workflows/website.yml), every push to main touching `apps/website/**`) | GitHub variable `MEDIA_ORIGIN` unset | GitHub variable `MEDIA_ORIGIN=https://media.boromtech.com` |

Both modes build, run the copy check and deploy. Production also uploads the images to R2 before deploying, so no
live page points at an image that isn't there yet. Once production is live, deploy only in production mode: a
plain `npm run deploy` would turn the workers.dev URL back on and put the images back inside the Worker.

## Going live on boromtech.com, once

The workers.dev mode needs only a Cloudflare account with a workers.dev subdomain. On the first deploy, wrangler
asks you to pick one if the account has none. Do steps 1–3 before switching to production mode.

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
   `CLOUDFLARE_ACCOUNT_ID`. For workers.dev, the token needs only Account › Workers Scripts: Edit. For production,
   also add Account › Workers R2 Storage: Edit, Zone (boromtech.com) › Workers Routes: Edit and Zone › DNS: Edit
   (the custom domain creates its own DNS record).
   If the job board shares this token, it also needs what that job board's deploy needs. The job board on
   `crew-cloudflare-neon` still says crew.boromtech.co: move it to crew.boromtech.com in that branch.
4. **www (optional).** The site doesn't link to www, and www isn't routed to the Worker. To catch it, add a proxied
   `www` AAAA `100::` record and a Redirect Rule: www.boromtech.com/* → https://boromtech.com/${1}, 301, keep the query string.
5. **Switch and check.** Set the GitHub variable `MEDIA_ORIGIN=https://media.boromtech.com` and re-run the
   workflow, or run `npm run deploy:production`. Then check https://boromtech.com with an English
   browser (it should redirect to /en/), check that images load from media.boromtech.com with
   `cache-control: public, max-age=31536000, immutable`, and run Lighthouse (mobile) against the live site.
6. **Retire Vercel.** Once the workers.dev site checks out, delete the Vercel project. The local `.vercel/` folder
   can go too.

## Worth knowing

- Canonical, sitemap and OG URLs always say https://boromtech.com (`site` in astro.config.mjs), even on
  workers.dev. Search engines see the workers.dev copy as a duplicate of a domain that doesn't answer yet, and
  social previews show no image until boromtech.com is live.
- Production adds `<link rel="preconnect">` to the media origin. Every image is `loading="lazy"` and below the fold,
  so if Lighthouse reports the preconnect as unused, change it to `dns-prefetch` in `src/layouts/Base.astro`.
- Image keys are content-hashed and never deleted from R2, so pages still cached in browsers keep working. Storage
  grows by a few MB for each photo change.
- The largest files are the video (`public/media/*.webm`, 2.2 MB) and one 2.1 MB photo. Both are well under the
  25 MiB per-file cap of Workers static assets. The video stays a Workers asset in both modes. Its only
  metadata is an encoder tag. If a large video moves to R2 later, run `ffmpeg -map_metadata -1` on it once and
  commit the stripped file.
- Unknown paths return a bare 404, because the site has no 404 page. To get one, add `src/pages/404.astro` and set
  `not_found_handling = "404-page"`.
- Merging with `crew-cloudflare-neon` will conflict in `package-lock.json`, since both branches add wrangler. Run
  `npm install` after the merge to fix it. Both workflows can live side by side: this branch adds only `website.yml`.
