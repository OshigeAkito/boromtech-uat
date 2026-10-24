
document.querySelectorAll('.chapter, .footer').forEach((section) => {
  section.querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--d', `${i * 80}ms`))
})

const seen = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const el = entry.target.matches('.reveal') ? entry.target : entry.target.querySelector('.shutter')
      el.classList.add('is-in')
      seen.unobserve(entry.target)
    }
  },
  { threshold: 0.18 },
)
// A clipped element never reports as visible, so the shutter is watched through its unclipped parent.
document.querySelectorAll('.reveal').forEach((el) => seen.observe(el))
document.querySelectorAll('.shutter').forEach((el) => seen.observe(el.parentElement))

const boxes = [...document.querySelectorAll('#symptoms input')]
const verdictLine = document.getElementById('verdict-line')
const send = document.getElementById('verdict-send')

// Per-locale wording comes from data attributes on the page; {n} and {symptoms} are filled here.
const mailto = (subject, body) => `mailto:${send.dataset.mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

function updateVerdict() {
  const picked = boxes.filter((b) => b.checked).map((b) => b.closest('label').querySelector('.symptom').textContent)
  if (picked.length === 0) {
    verdictLine.textContent = verdictLine.dataset.default
    send.href = '#contact'
    return
  }
  verdictLine.textContent = verdictLine.dataset.picked.replace('{n}', picked.length)
  send.href = mailto(send.dataset.subject, send.dataset.body.replace('{symptoms}', picked.map((p) => `• ${p}`).join('\n')))
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

// A manual language choice is kept for a year; detection on / (middleware.js, Base.astro) always honours it.
document.querySelectorAll('a[data-locale]').forEach((a) =>
  a.addEventListener('click', () => {
    document.cookie = `lang=${a.dataset.locale}; path=/; max-age=31536000; samesite=lax`
  }),
)
const langMenu = document.querySelector('[data-lang-menu]')
document.addEventListener('click', (e) => {
  if (langMenu?.open && !langMenu.contains(e.target)) langMenu.open = false
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && langMenu?.open) {
    langMenu.open = false
    langMenu.querySelector('summary').focus()
  }
})
