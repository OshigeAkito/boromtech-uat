// Checks that every value in COPY.md appears on the built page (dist/index.html) or in the page script.
// Run after `astro build`: node scripts/check-copy.mjs
import { readFileSync } from 'node:fs'

const copy = readFileSync(new URL('../COPY.md', import.meta.url), 'utf8')
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const script = readFileSync(new URL('../src/scripts/site.js', import.meta.url), 'utf8')

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const flat = (s) => decode(s).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
const attrs = [...html.matchAll(/(?:alt|content|data-default|title)="([^"]*)"/g)].map((m) => decode(m[1]))
const corpus = [flat(html), ...attrs, script.replace(/\\n/g, ' ')].join(' \u0000 ').replace(/\s+/g, ' ')

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
console.log(`${values.length} copy entries checked, ${missing} missing`)
process.exit(missing ? 1 : 0)
