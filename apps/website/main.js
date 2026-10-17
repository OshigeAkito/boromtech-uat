const MAIL = 'hello@boromtech.co'
const AUDIT = 'ทุกเคสเริ่มที่ออดิต 5 วันทำการ ฟิกซ์ไพรซ์ ฿25,000 หักคืนเต็มจำนวนเมื่อรีสโตร์ต่อกับเรา'

document.querySelectorAll('.chapter, .footer').forEach((section) => {
  section.querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--d', `${i * 80}ms`))
})
document.querySelectorAll('.stage').forEach((el, i) => el.style.setProperty('--d', `${i * 120}ms`))
document.querySelectorAll('.blocks span').forEach((el, i) => el.style.setProperty('--d', `${i * 60}ms`))

const seen = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const el = entry.target.matches('.reveal, .stages, .blocks') ? entry.target : entry.target.querySelector('.shutter')
      el.classList.add('is-in')
      seen.unobserve(entry.target)
    }
  },
  { threshold: 0.18 },
)
// A clipped element never reports as visible, so the shutter is watched through its unclipped parent.
document.querySelectorAll('.reveal, .stages, .blocks').forEach((el) => seen.observe(el))
document.querySelectorAll('.shutter').forEach((el) => seen.observe(el.parentElement))

const mailto = (subject, body) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

const boxes = [...document.querySelectorAll('#symptoms input')]
const verdictLine = document.getElementById('verdict-line')
const send = document.getElementById('verdict-send')

function updateVerdict() {
  const picked = boxes.filter((b) => b.checked).map((b) => b.closest('label').querySelector('.symptom').textContent)
  if (picked.length === 0) {
    verdictLine.textContent = AUDIT
    send.href = '#contact'
    return
  }
  verdictLine.textContent = `${picked.length} อาการ · ออดิต 5 วันทำการ ฟิกซ์ไพรซ์ ฿25,000 ครอบคลุมทั้งหมดที่คุณเลือก และหักคืนเต็มจำนวนเมื่อรีสโตร์ต่อกับเรา`
  send.href = mailto('นัดออดิตซิสเต็ม', `สวัสดีครับ/ค่ะ\n\nซิสเต็มของเรามีอาการดังนี้\n${picked.map((p) => `• ${p}`).join('\n')}\n\nชื่อซิสเต็ม:\nเทคโนโลยีที่ใช้ (ถ้าทราบ):\nเบอร์ติดต่อ:\n`)
}
boxes.forEach((b) => b.addEventListener('change', updateVerdict))

const tabs = [...document.querySelectorAll('.outputs [role="tab"]')]
tabs.forEach((tab) =>
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)))
    document.querySelectorAll('.sheet').forEach((sheet) => {
      const show = sheet.id === tab.getAttribute('aria-controls')
      sheet.hidden = !show
      if (show) {
        sheet.classList.remove('is-swapping')
        void sheet.offsetWidth
        sheet.classList.add('is-swapping')
      }
    })
  }),
)
