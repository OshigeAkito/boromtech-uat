import { HeroSeal, Wordmark } from '@boromtech/brand'

export const OnIvory = () => (
  <div style={{ background: 'var(--ivory)', padding: 40 }}>
    <Wordmark tone="navy" height={40} />
  </div>
)

export const OnPaper = () => (
  <div style={{ background: 'var(--paper)', padding: 40, boxShadow: 'inset 0 0 0 1px var(--line)' }}>
    <Wordmark tone="navy" height={40} />
  </div>
)

export const OnNight = () => (
  <div style={{ background: 'var(--night)', padding: 40 }}>
    <Wordmark tone="light" height={40} />
  </div>
)

export const InNav = () => (
  <nav style={{ background: 'var(--night)', color: 'var(--on-dark)', display: 'flex', alignItems: 'center', gap: 28, padding: '20px 36px', font: '15px var(--font-text)' }}>
    <Wordmark tone="light" height={20} style={{ marginRight: 'auto' }} />
    <span>Services</span>
    <span>Process</span>
    <span>FAQ</span>
    <span style={{ background: 'var(--orange)', color: 'var(--ink)', fontWeight: 600, padding: '12px 20px' }}>Book an audit</span>
  </nav>
)

// Business card, 90 x 55 mm drawn at 4px per mm. Text stays at least 4 mm (16px) inside the trim.
const card = { position: 'relative' as const, overflow: 'hidden', width: 360, height: 220, boxSizing: 'border-box' as const, padding: '22px 24px' }

export const BusinessCard = () => (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
    <div style={{ ...card, background: 'var(--ivory)', boxShadow: 'inset 0 0 0 1px var(--line)', display: 'flex', flexDirection: 'column', color: 'var(--night)', fontFamily: 'var(--font-text)' }}>
      <Wordmark tone="navy" height={12} />
      <div lang="th" style={{ marginTop: 34, font: '700 17px/1.3 var(--font-text)' }}>ชื่อ นามสกุล</div>
      <div style={{ marginTop: 4, font: '400 11px/1.4 var(--font-text)', color: 'var(--muted)' }}>Chief Operating Officer</div>
      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--orange)', paddingTop: 8, font: '500 11px/1.4 var(--font-text)' }}>boromtech.com</div>
    </div>
    <div style={{ ...card, background: 'var(--night)' }}>
      <HeroSeal />
      <Wordmark tone="light" height={12} style={{ position: 'relative' }} />
    </div>
  </div>
)
