// Vercel Routing Middleware: sends first-time visitors of the Thai root to their language before the page loads.
import { parseAcceptLanguage, pickLocale } from './src/i18n/detect.mjs'

export const config = { matcher: '/' }

export default function middleware(request) {
  const headers = request.headers
  const locale = pickLocale({
    saved: /(?:^|;\s*)lang=(\w+)/.exec(headers.get('cookie') || '')?.[1],
    languages: parseAcceptLanguage(headers.get('accept-language')),
    country: headers.get('x-vercel-ip-country'),
    userAgent: headers.get('user-agent'),
  })
  if (locale === 'th') return
  return new Response(null, {
    status: 307,
    headers: { Location: new URL(`/${locale}/`, request.url).href, 'Cache-Control': 'private, no-store' },
  })
}
