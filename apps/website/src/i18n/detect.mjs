// Picks the locale for a visitor who lands on the Thai root (/).
// Order: saved choice (lang cookie) → browser languages → Vercel IP country → Thai.
// Requests without browser languages, and bots, stay on Thai so crawlers index the original page.
// Self-contained on purpose: Base.astro inlines its source for the client-side fallback, and middleware.js imports it.
export function pickLocale({ saved, languages, country, userAgent }) {
  const supported = ['th', 'en', 'vi', 'zh']
  if (supported.includes(saved)) return saved
  if (!languages || !languages.length || /bot|crawl|spider|slurp|preview|facebookexternalhit|lighthouse|headless/i.test(userAgent || '')) return 'th'
  for (const tag of languages) {
    const base = String(tag).toLowerCase().split('-')[0]
    if (supported.includes(base)) return base
  }
  if (!country) return 'th'
  const byCountry = { TH: 'th', VN: 'vi', CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh' }
  return byCountry[country.toUpperCase()] || 'en'
}

// "vi-VN,vi;q=0.9,en;q=0.5" → ['vi-VN', 'vi', 'en'], highest q first, q=0 and * dropped.
export function parseAcceptLanguage(header) {
  return (header || '')
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return { tag, q: q ? Number(q.slice(2)) : 1, i }
    })
    .filter(({ tag, q }) => tag && tag !== '*' && q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map(({ tag }) => tag)
}
