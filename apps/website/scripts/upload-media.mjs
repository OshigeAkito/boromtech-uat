// Uploads the images Astro built (dist/_astro/*.{jpg,png,webp,avif}) to the R2 bucket bt-public, which serves them
// at MEDIA_ORIGIN (build.assetsPrefix in astro.config.mjs). Without MEDIA_ORIGIN the images ship with the Worker
// and there is nothing to upload. Run after `astro build` with the same MEDIA_ORIGIN, and before
// `wrangler deploy`, so no deployed page points at an image that isn't there yet. Needs CLOUDFLARE_API_TOKEN (with
// R2 write on bt-public) and CLOUDFLARE_ACCOUNT_ID, or a `wrangler login`.
// Keys are content-hashed, so each object is immutable: re-uploading one is harmless, and old ones stay for pages
// still open in browsers or caches.
import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
if (!process.env.MEDIA_ORIGIN) {
  console.log('MEDIA_ORIGIN is unset: images ship with the Worker, nothing to upload.')
  process.exit(0)
}
const bucket = process.env.BUCKET || 'bt-public'
// Keep in step with mediaTypes in astro.config.mjs.
const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' }
const dir = new URL('../dist/_astro/', import.meta.url)
const files = readdirSync(dir).filter((f) => types[f.split('.').pop()])
if (!files.length) throw new Error('No images in dist/_astro. Run `astro build` first.')

const queue = [...files]
const upload = async () => {
  for (let file; (file = queue.shift()); ) {
    await run('npx', [
      'wrangler', 'r2', 'object', 'put', `${bucket}/_astro/${file}`, '--remote',
      '--file', fileURLToPath(new URL(file, dir)),
      '--content-type', types[file.split('.').pop()],
      '--cache-control', 'public, max-age=31536000, immutable',
    ])
    console.log(`  ${bucket}/_astro/${file}`)
  }
}
await Promise.all(Array.from({ length: 8 }, upload))
console.log(`Uploaded ${files.length} images to ${bucket}.`)
