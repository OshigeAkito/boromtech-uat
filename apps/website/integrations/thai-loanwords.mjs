import { readFile, writeFile } from 'node:fs/promises'

// Chrome's Thai line breaker does not know English loanwords and splits them mid-word (การัน|ตี),
// so every loanword in visible text is wrapped in a no-break span after the build.
const LOANWORDS = [
  'แฮนด์โอเวอร์', 'ระดับโลก', 'ฟิกซ์ไพรซ์', 'ด็อกคิวเมนต์', 'คอนซัลติ้ง', 'มอนิเตอริง', 'มอนิเตอร์', 'รีคัฟเวอร์', 'โปรดักชัน',
  'เซิร์ฟเวอร์', 'ซอฟต์แวร์', 'ไดอะแกรม', 'วอร์แรนตี', 'เทคโนโลยี', 'ซัพพอร์ต', 'ดาต้าเบส', 'โปรเจกต์', 'เวนเดอร์',
  'ออร์เดอร์', 'แอคเคาท์', 'แบ็กอัป', 'อัปเกรด', 'อัปเดต', 'การันตี', 'ซิสเต็ม', 'รีพอร์ต', 'ฟีเจอร์', 'รูทคอส',
  'ดีพลอย', 'วีคลี่', 'เทคนิค', 'คลาวด์', 'โมดูล', 'ออดิต', 'ทาสก์', 'สโคป', 'สต็อก', 'โค้ด',
]
const pattern = new RegExp(`(${LOANWORDS.join('|')})`, 'g')
const SKIP = /<(script|style|title|textarea)\b[\s\S]*?<\/\1>|<[^>]+>/g

export function wrapLoanwords(html) {
  let out = ''
  let last = 0
  for (const m of html.matchAll(SKIP)) {
    out += html.slice(last, m.index).replace(pattern, '<span class="nb">$1</span>') + m[0]
    last = m.index + m[0].length
  }
  return out + html.slice(last).replace(pattern, '<span class="nb">$1</span>')
}

export default function thaiLoanwords() {
  return {
    name: 'thai-loanwords',
    hooks: {
      'astro:build:done': async ({ pages, dir }) => {
        for (const { pathname } of pages) {
          const file = new URL(`${pathname}index.html`, dir)
          await writeFile(file, wrapLoanwords(await readFile(file, 'utf8')))
        }
      },
    },
  }
}
