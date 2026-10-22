// Sends first-time visitors of the Thai root (/) to their language before the page loads. wrangler.toml runs
// this only for "/"; every other path is a static asset. Base.astro has a client-side fallback without the country.
import { parseAcceptLanguage, pickLocale } from './src/i18n/detect.mjs'

export default {
  async fetch(request, env) {
    const headers = request.headers
    const locale = pickLocale({
      saved: /(?:^|;\s*)lang=(\w+)/.exec(headers.get('cookie') || '')?.[1],
      languages: parseAcceptLanguage(headers.get('accept-language')),
      country: request.cf?.country,
      userAgent: headers.get('user-agent'),
    })
    if (locale === 'th') return env.ASSETS.fetch(request)
    return new Response(null, {
      status: 307,
      headers: { Location: new URL(`/${locale}/`, request.url).href, 'Cache-Control': 'private, no-store' },
    })
  },
}
