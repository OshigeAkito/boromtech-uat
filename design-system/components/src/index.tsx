import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type TaskStatus = 'open' | 'assigned' | 'changes' | 'submitted' | 'approved' | 'paid'
type Tone = 'brand' | 'neutral' | 'danger' | 'warning' | 'success-ring' | 'success'

export const STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'brand' },
  assigned: { label: 'In progress', tone: 'neutral' },
  changes: { label: 'Changes requested', tone: 'danger' },
  submitted: { label: 'Awaiting review', tone: 'warning' },
  approved: { label: 'Approved, unpaid', tone: 'success-ring' },
  paid: { label: 'Paid', tone: 'success' },
}

export type Tier = 'Gold' | 'Silver' | 'Bronze' | 'Rookie' | 'Unranked'
const TIER_BARS: Record<Tier, number> = { Gold: 3, Silver: 2, Bronze: 1, Rookie: 0, Unranked: 0 }

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} {...rest} className={cx('bt-btn', `bt-btn-${variant}`, `bt-btn-${size}`, className)} />
}

export function StatusPill({ status, children }: { status: TaskStatus; children?: ReactNode }) {
  const s = STATUS[status]
  return (
    <span className={cx('bt-pill', `bt-tone-${s.tone}`)}>
      <span className="bt-pill-dot" aria-hidden />
      {children ?? s.label}
    </span>
  )
}

export interface StarRatingProps {
  value: number
  max?: number
  onChange?: (value: number) => void
  size?: 'md' | 'sm'
}

export function StarRating({ value, max = 5, onChange, size = 'md' }: StarRatingProps) {
  const stars = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <span
      className={cx('bt-stars', size === 'sm' && 'bt-stars-sm')}
      role={onChange ? 'group' : 'img'}
      aria-label={onChange ? 'Grade' : `Grade ${value} of ${max}`}
    >
      {stars.map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            className={cx('bt-star', n <= value && 'bt-star-on')}
            aria-label={`${n} of ${max}`}
            aria-pressed={n === value}
            onClick={() => onChange(n)}
          >
            ★
          </button>
        ) : (
          <span key={n} className={cx('bt-star', n <= value && 'bt-star-on')} aria-hidden>
            ★
          </span>
        ),
      )}
    </span>
  )
}

export function TierBadge({ tier, score }: { tier: Tier; score?: number }) {
  const bars = TIER_BARS[tier]
  return (
    <span className={cx('bt-tier', tier === 'Unranked' && 'bt-tier-muted')} title={score == null ? tier : `${tier}, score ${score}`}>
      <span className="bt-tier-bars" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx('bt-tier-bar', i < bars && 'bt-tier-bar-on')} />
        ))}
      </span>
      <span>{tier}</span>
      {score != null && <span className="bt-tier-score">{score}</span>}
    </span>
  )
}

const DAY = 86_400_000

export function dueText(due: string, now: number) {
  const date = new Date(`${due}T00:00:00`)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = Math.round((date.getTime() - today.getTime()) / DAY)
  const label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
  const dateOnly = `Due ${label}`
  if (days < 0) return { text: `${dateOnly} · ${plural(-days)} overdue`, date: dateOnly, late: true, soon: false }
  if (days === 0) return { text: 'Due today', date: dateOnly, late: false, soon: true }
  return { text: `${dateOnly} · ${plural(days)} left`, date: dateOnly, late: false, soon: days <= 2 }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export interface TaskCardProps {
  title: string
  project?: string
  description?: string
  payout: number
  currency?: string
  due?: string
  status: TaskStatus
  assignee?: string | null
  submission?: string | null
  review?: { grade: number; feedback?: string } | null
  compact?: boolean
  now?: number
  children?: ReactNode
}

export function TaskCard({
  title,
  project,
  description,
  payout,
  currency = '฿',
  due,
  status,
  assignee,
  submission,
  review,
  compact,
  now = Date.now(),
  children,
}: TaskCardProps) {
  const deadline = due ? dueText(due, now) : null
  const live = status === 'open' || status === 'assigned' || status === 'changes'
  return (
    <article className={cx('bt-task', compact && 'bt-task-compact')}>
      <header className="bt-task-head">
        <StatusPill status={status} />
        <span className="bt-task-payout">
          {currency}
          {payout.toLocaleString('en-US')}
        </span>
      </header>
      <div className="bt-task-titles">
        <h3 className="bt-task-title">{title}</h3>
        {project && <p className="bt-task-project">{project}</p>}
      </div>
      {description && <p className="bt-task-desc">{description}</p>}
      {(deadline || assignee) && (
        <div className="bt-task-meta">
          {deadline && (
            <span className={cx('bt-task-due', live && deadline.late && 'bt-late', live && deadline.soon && 'bt-soon')}>
              {live ? deadline.text : deadline.date}
            </span>
          )}
          {assignee && (
            <span className="bt-task-who">
              <span className="bt-avatar" aria-hidden>
                {initials(assignee)}
              </span>
              {assignee}
            </span>
          )}
        </div>
      )}
      {submission && (
        <a className="bt-task-link" href={submission} target="_blank" rel="noreferrer">
          {submission.replace(/^https?:\/\//, '')}
        </a>
      )}
      {review && (
        <div className={cx('bt-task-review', !review.grade && 'bt-task-review-changes')}>
          {review.grade ? <StarRating value={review.grade} size="sm" /> : <strong>Changes requested</strong>}
          {review.feedback && <span>{review.feedback}</span>}
        </div>
      )}
      {children && <footer className="bt-task-actions">{children}</footer>}
    </article>
  )
}
