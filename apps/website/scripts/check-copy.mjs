// Checks that every value in COPY.md appears on the built Thai page (dist/index.html) or in the page script,
// then that every string in src/i18n/<locale>.ts appears on dist/<locale>/index.html with no Thai left over.
// Run after `astro build`: node scripts/check-copy.mjs
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const copy = read('../COPY.md')
const html = read('../dist/index.html')
const script = read('../src/scripts/site.js')

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const flat = (s) => decode(s).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
const attrs = (s) => [...s.matchAll(/(?:alt|content|data-[\w-]+|title|aria-label)="([^"]*)"/g)].map((m) => decode(m[1]))
const corpusOf = (page, ...extra) => [flat(page), ...attrs(page), ...extra].join(' \u0000 ').replace(/\s+/g, ' ')
const corpus = corpusOf(html, script.replace(/\\n/g, ' '))

const values = []
const lines = copy.split('\n')
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\[([\w.]+)\]\s*(.*)$/)
  if (!m) continue
  const [, key, rest] = m
  const inline = rest.replace(/^⚠\s*/, '')
  const annotated = /📏|⚠|ไม่ต้องแก้|ป้าย|คำอธิบาย|บรรทัดเล็ก|แสดง/.test(rest) || rest === ''
  let value = inline
  if (annotated) {
    const block = []
    for (let j = i + 1; j < lines.length && lines[j].trim() !== '' && !lines[j].startsWith('['); j++) block.push(lines[j])
    if (block.length === 0) { value = inline; } else value = block.join(' ')
  }
  values.push([key, value.trim()])
}

const skip = /^(seo\.|cases\.email\.body|contact\.email|cases\.email|footer\.credits$)/
let missing = 0
for (const [key, value] of values) {
  if (!value || skip.test(key)) continue
  const parts = value.replace(/\{[^}]+\}/g, '\u0001').split(/\s·\s|\u0001/).map((p) => p.trim()).filter((p) => p.length > 1)
  const absent = parts.filter((p) => !corpus.includes(p.replace(/\s+/g, ' ')))
  if (absent.length) {
    missing++
    console.log(`MISSING ${key}: ${absent.join(' | ')}`)
  }
}
const seo = [...copy.matchAll(/^\[seo\.(title|description)\][^\n]*\n(.+)$/gm)]
for (const [, key, value] of seo) {
  const ok = html.includes(key === 'title' ? `<title>${value}</title>` : `content="${value}"`)
  if (!ok) { missing++; console.log(`MISSING seo.${key}`) }
}
console.log(`th: ${values.length} copy entries checked, ${missing} missing`)

const leaves = (node, path = []) =>
  typeof node === 'string' ? [[path.join('.'), node]] : Object.entries(node).flatMap(([k, v]) => leaves(v, [...path, k]))

// Strings for content the site leaves out on purpose, worked out from the data and the built page rather than listed:
// the trusted section until a client consents, hidden expert cards, and the years label until a card has years.
const { experts } = await import('../src/data/experts.ts')
const hiddenExperts = experts.filter((e) => e.hidden).map((e) => e.id)
const anyYears = experts.some((e) => !e.hidden && e.experience.years !== null)
const unused = (key, page) =>
  (key.startsWith('trusted.') && !page.includes('id="trusted"')) ||
  hiddenExperts.some((id) => key === `experts.desc.${id}`) ||
  (key === 'experts.yearsLabel' && !anyYears)

for (const locale of ['en', 'vi', 'zh']) {
  const { default: strings } = await import(`../src/i18n/${locale}.ts`)
  const page = read(`../dist/${locale}/index.html`)
  const text = corpusOf(page)
  let localeMissing = 0
  for (const [key, value] of leaves(strings)) {
    if (unused(key, page)) continue
    const parts = value.split(/\{\w+\}|\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 1)
    const absent = parts.filter((p) => !text.includes(p))
    if (absent.length) {
      localeMissing++
      console.log(`MISSING ${locale} ${key}: ${absent.join(' | ')}`)
    }
  }
  // Thai may appear only inside elements marked lang="th": the language switcher's link and the footer address.
  const leftover = [...page.replace(/<(\w+)[^>]*\slang="th"[^>]*>[\s\S]*?<\/\1>/g, '').matchAll(/[^<>"]{0,30}[฀-๿]+[^<>"]{0,30}/g)]
  for (const [snippet] of leftover) {
    localeMissing++
    console.log(`THAI LEFT ON /${locale}/: ${snippet.trim()}`)
  }
  console.log(`${locale}: ${leaves(strings).length} strings checked, ${localeMissing} problems`)
  missing += localeMissing
}
process.exit(missing ? 1 : 0)
