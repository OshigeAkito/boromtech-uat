import { Wordmark } from '@boromtech/brand'

export const OnPaper = () => (
  <div style={{ background: 'var(--paper)', padding: 28, boxShadow: 'inset 0 0 0 1px var(--line)' }}>
    <Wordmark tone="ink" height={40} />
  </div>
)

export const OnNight = () => (
  <div style={{ background: 'var(--night)', padding: 28 }}>
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
