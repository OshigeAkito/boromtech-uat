import { Seal } from '@boromtech/brand'

const tile = (bg: string, outline = false) => ({ background: bg, width: 120, height: 120, display: 'grid', placeItems: 'center', boxShadow: outline ? 'inset 0 0 0 1px var(--line)' : 'none' })
const cap = { font: '13px/1.4 var(--font-text)', color: 'var(--muted)', marginTop: 8 }

export const OnGrounds = () => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    {([['var(--night)', 'orange', 'Orange on night'], ['var(--paper)', 'orange', 'Orange on paper'], ['var(--soft)', 'rust', 'Rust on soft'], ['var(--ivory)', 'rust', 'Rust on ivory'], ['var(--orange)', 'ink', 'Ink on orange']] as const).map(([bg, tone, text]) => (
      <div key={text}>
        <div style={tile(bg, bg === 'var(--paper)')}><Seal tone={tone} size={64} title={text} /></div>
        <div style={cap}>{text}</div>
      </div>
    ))}
  </div>
)

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', font: '13px/1.4 var(--font-text)', color: 'var(--muted)' }}>
    {[16, 20, 24, 48, 96].map((s) => (
      <div key={s} style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <Seal size={s} />
        <span>{s}px{s < 24 ? ' · small ring' : ''}</span>
      </div>
    ))}
  </div>
)
