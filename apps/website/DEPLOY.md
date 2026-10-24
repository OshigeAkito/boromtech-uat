# Deploying the website (Cloudflare)

Two Workers, both on the boromtech.com zone (registered at Cloudflare Registrar on 2026-10-20):

- `boromtech-website` ([wrangler.toml](wrangler.toml)) serves `dist/` as static assets on https://boromtech.com.
  [worker.mjs](worker.mjs) runs only for `/` and sends first-time visitors to `/en/`, `/vi/` or `/zh/`.
- `boromtech-www` ([www/wrangler.toml](www/wrangler.toml)) answers www.boromtech.com with a 301 to the apex, keeping
  the path and query. It's a separate Worker because static assets are matched before any code runs.

Each Worker's custom domain creates its own DNS record and certificate on the first deploy. No DNS work is needed.
One zone setting to turn on once: SSL/TLS → Edge Certificates → **Always Use HTTPS**, so http://boromtech.com
redirects to https. The www Worker already redirects to https itself.

**Deploy:** from `apps/website`, after `npx wrangler login`, run `npm run deploy`. It builds, runs the copy check,
uploads images if `MEDIA_ORIGIN` is set, and deploys both Workers. CI
([website.yml](../../.github/workflows/website.yml)) does the same on every push to main that touches
`apps/website/**`. CI needs the `production` GitHub environment with secret `CLOUDFLARE_API_TOKEN` (Workers
Scripts: Edit, plus Zone boromtech.com › Workers Routes: Edit and DNS: Edit) and variable `CLOUDFLARE_ACCOUNT_ID`.

## Images on R2 (optional, later)

By default, images ship inside the Worker with the rest of `dist/`. To serve them from R2 `bt-public` at
https://media.boromtech.com instead:

1. Create the bucket (`npx wrangler r2 bucket create bt-public --location apac`). Then connect the custom domain:
   R2 → bt-public → Settings → Custom Domains → `media.boromtech.com`. Leave the r2.dev URL off.
2. Make sure your login can write to R2. A plain `wrangler login` grant may lack R2, so check with
   `npx wrangler whoami`. For CI, add Account › Workers R2 Storage: Edit to the token.
3. Deploy with the switch on: `MEDIA_ORIGIN=https://media.boromtech.com npm run deploy`. In CI, set the GitHub
   variable `MEDIA_ORIGIN` to the same value.

With the switch on, the build points jpg/png/webp/avif at the media origin, writes `dist/.assetsignore` so they
stay out of the Worker, and adds a preconnect. `upload-media` puts them in R2 with
`public, max-age=31536000, immutable` before the deploy. Image keys are content-hashed and never deleted, so
pages still cached in browsers keep working.

## Worth knowing

- **Email:** the site lists sales@boromtech.com. Mail to it only arrives once MX records exist (for example from
  Google Workspace, Zoho, or Cloudflare Email Routing to an existing inbox).
- **boromtech.co** is not registered. Buying it and redirecting it to .com would catch typos.
- **Lighthouse:** every image is `loading="lazy"` and below the fold. If Lighthouse reports the media preconnect
  as unused, change it to `dns-prefetch` in `src/layouts/Base.astro`.
- **File sizes:** the largest files are the video (`public/media/*.webm`, 2.2 MB) and one 2.1 MB photo. Both are
  well under the 25 MiB per-file cap of Workers static assets. The video's only metadata is an encoder tag. If a
  large video moves to R2 later, run `ffmpeg -map_metadata -1` on it once and commit the stripped file.
- **404s:** unknown paths return a bare 404, because the site has no 404 page. To get one, add
  `src/pages/404.astro` and set `not_found_handling = "404-page"`.
- **Merge conflict:** merging with `crew-cloudflare-neon` will conflict in `package-lock.json`, since both branches
  add wrangler. Run `npm install` after the merge. That branch still says crew.boromtech.co.
