import { Button } from '@boromtech/brand'

const row = { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'center', fontFamily: 'var(--font-sans)' }

export const Variants = () => (
  <div style={row}>
    <Button variant="primary">Claim task</Button>
    <Button>View brief</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="danger">Request changes</Button>
  </div>
)

export const Small = () => (
  <div style={row}>
    <Button variant="primary" size="sm">Mark ฿4,500 paid</Button>
    <Button size="sm">Download brief</Button>
    <Button size="sm" disabled>Submitted</Button>
  </div>
)
