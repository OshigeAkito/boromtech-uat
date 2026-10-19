import { Button, StarRating, TaskCard } from '@boromtech/brand'

// A fixed "now" keeps the due lines stable between captures: 20 Oct 2026.
const NOW = new Date('2026-10-20T09:00:00').getTime()
const box = { width: 320, fontFamily: 'var(--font-sans)' }

export const Open = () => (
  <div style={box}>
    <TaskCard status="open" title="Build the booking form" project="Siam Dental clinic app" description="React form with date and time picker, validation, and a confirmation step. Figma frames are linked in the brief." payout={4500} due="2026-11-03" now={NOW}>
      <Button variant="primary">Claim task</Button>
    </TaskCard>
  </div>
)

export const AwaitingReview = () => (
  <div style={box}>
    <TaskCard status="submitted" title="Translate onboarding screens to Thai" project="Kaset Market app" payout={1800} due="2026-10-21" assignee="Nok Siriwan" submission="https://github.com/kaset/app/pull/42" now={NOW}>
      <StarRating value={4} onChange={() => {}} />
      <Button variant="primary">Pass &amp; grade</Button>
      <Button variant="danger">Request changes</Button>
    </TaskCard>
  </div>
)

export const Paid = () => (
  <div style={box}>
    <TaskCard status="paid" title="Fix PDF invoice layout" project="Chiang Mai Coffee POS" payout={2200} due="2026-10-17" assignee="Arthit Pong" review={{ grade: 5, feedback: 'Clean, matched the spec first time.' }} now={NOW} />
  </div>
)
