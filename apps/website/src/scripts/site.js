
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

const mailto = (subject, body) => `mailto:${send.dataset.mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

const boxes = [...document.querySelectorAll('#symptoms input')]
const verdictLine = document.getElementById('verdict-line')
const send = document.getElementById('verdict-send')

function updateVerdict() {
  const picked = boxes.filter((b) => b.checked).map((b) => b.closest('label').querySelector('.symptom').textContent)
  if (picked.length === 0) {
    verdictLine.textContent = verdictLine.dataset.default
    send.href = '#contact'
    return
  }
  verdictLine.textContent = `${picked.length} อาการ · ออดิต 5 วันทำการ ครอบคลุมทั้งหมดที่คุณเลือก พร้อมใบเสนอราคาฟิกซ์ไพรซ์ก่อนเริ่มงาน`
  send.href = mailto('นัดออดิตซิสเต็ม', `สวัสดีครับ/ค่ะ\n\nซิสเต็มของเรามีอาการดังนี้\n${picked.map((p) => `• ${p}`).join('\n')}\n\nชื่อซิสเต็ม / โปรเจกต์:\nเทคโนโลยีที่ใช้ (ถ้าทราบ):\nเบอร์ติดต่อ:\n`)
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

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
const videos = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    const video = entry.target
    video.querySelectorAll('source[data-src]').forEach((s) => (s.src = s.dataset.src))
    video.load()
    video.play().catch(() => {})
    videos.unobserve(video)
  }
}, { rootMargin: '200px' })
if (!calm) document.querySelectorAll('video[data-lazy-video]').forEach((v) => videos.observe(v))
