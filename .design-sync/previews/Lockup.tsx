import { Lockup } from '@boromtech/brand'

const tile = (bg: string, outline = false) => ({ background: bg, padding: '28px 32px', boxShadow: outline ? 'inset 0 0 0 1px var(--line)' : 'none' })

export const Grounds = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
    <div style={tile('var(--night)')}><Lockup ground="night" height={40} /></div>
    <div style={tile('var(--paper)', true)}><Lockup ground="paper" height={40} /></div>
    <div style={tile('var(--soft)')}><Lockup ground="soft" height={40} /></div>
    <div style={tile('var(--sunken)')}><Lockup ground="mono" height={40} /></div>
  </div>
)

export const DocumentHeader = () => (
  <div style={{ background: 'var(--paper)', padding: '32px 44px', boxShadow: 'inset 0 0 0 1px var(--line)', font: '16px/1.6 var(--font-text)', color: 'var(--ink)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingBottom: 20, borderBottom: '1px solid var(--line)', fontSize: 14, color: 'var(--muted)' }}>
      <Lockup ground="paper" height={24} />
      <span>Audit Report · <span style={{ font: '500 14px var(--font-mono)', color: 'var(--ink)' }}>BT-A-0412</span></span>
    </div>
    <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.3, marginTop: 24 }}>Inventory Management System · Sample Engagement</div>
    <div style={{ fontSize: 14, color: 'var(--muted)' }}>Assessment window 3–7 Nov 2026 · 182,400 LOC · 3 production hosts</div>
  </div>
)
