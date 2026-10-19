import { TierBadge } from '@boromtech/brand'

export const AllTiers = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontFamily: 'var(--font-sans)' }}>
    <TierBadge tier="Gold" score={91} />
    <TierBadge tier="Silver" score={72} />
    <TierBadge tier="Bronze" score={48} />
    <TierBadge tier="Rookie" score={22} />
    <TierBadge tier="Unranked" />
  </div>
)
