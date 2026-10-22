import { StatusPill } from '@boromtech/brand'

export const AllStates = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontFamily: 'var(--font-sans)' }}>
    {(['open', 'assigned', 'changes', 'submitted', 'approved', 'paid'] as const).map((s) => (
      <StatusPill key={s} status={s} />
    ))}
  </div>
)
