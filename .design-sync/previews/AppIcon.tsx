import { AppIcon } from '@boromtech/brand'

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end', font: '13px/1.4 var(--font-text)', color: 'var(--muted)' }}>
    {([[120, true, '120px, platform mask'], [64, false, '64px artwork'], [32, false, '32px'], [16, false, '16px']] as const).map(([s, m, t]) => (
      <div key={t} style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <AppIcon size={s} masked={m} title="BoromTech" />
        <span>{t}</span>
      </div>
    ))}
  </div>
)

export const BrowserTab = () => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', background: 'var(--sunken)', font: '13px var(--font-text)', color: 'var(--ink)' }}>
    <AppIcon size={16} />
    BoromTech · เอไอใครๆ ก็ทำได้
  </div>
)
