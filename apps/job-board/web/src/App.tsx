import { Button, StarRating, TaskCard, TierBadge } from '@boromtech/design-system/components/src'
import { defaultFreelancerDeadline, rank, toDateInput, type Invite, type Job, type Member, type Task } from '@boromtech/domain'
import { useState, type FormEvent, type ReactNode } from 'react'
import { run, signIn, signOut, useBoard, type Board, type SignInError } from './api'

type MemberBoard = Extract<Board, { state: 'member' }>

const SIGN_IN_ERRORS: Record<SignInError, string> = {
  not_invited: 'That Google account has not been invited yet. Ask a BoromTech admin for an invite.',
  email_unverified: 'Google has not verified that email address yet.',
  removed: 'This account was removed by an admin.',
  sign_in_failed: 'Sign-in failed. Please try again.',
}

// Failures are already on the board's error banner; this only stops an unhandled rejection.
const ignore = () => {}

export default function App() {
  const board = useBoard()
  if (board.state === 'loading') return <div className="center muted">Loading…</div>
  if (board.state === 'signedOut') return <Landing error={board.error && SIGN_IN_ERRORS[board.error]} />
  return <Workspace board={board} />
}

const DAY = 86_400_000

function Landing({ error }: { error?: string }) {
  return (
    <div className="landing">
      <section className="landing-copy">
        <p className="eyebrow">Invite only</p>
        <h1 className="display">
          BoromTech <span>Crew</span>
        </h1>
        <p className="lede">Small, well-scoped tasks from real client projects. Ship on time, get graded, get paid, climb the board.</p>
        <Button variant="primary" onClick={signIn}>
          Continue with Google
        </Button>
        {error && <p className="error">{error}</p>}
      </section>
      <aside className="landing-art" aria-label="Example task">
        <TaskCard
          status="open"
          title="Build the booking form"
          project="Example client job"
          description="React form with a date and time picker, validation, and a confirmation step."
          payout={4500}
          due={toDateInput(Date.now() + 14 * DAY)}
        >
          <Button variant="primary" tabIndex={-1}>
            Claim task
          </Button>
        </TaskCard>
      </aside>
    </div>
  )
}

const ADMIN_TABS = ['Jobs', 'Review', 'Leaderboard', 'Invites'] as const
const FREELANCER_TABS = ['Open tasks', 'My tasks', 'Leaderboard'] as const
type Tab = (typeof ADMIN_TABS)[number] | (typeof FREELANCER_TABS)[number]

function Workspace({ board }: { board: MemberBoard }) {
  const { me, jobs, tasks, members, invites, error, dismissError } = board
  const tabs: readonly Tab[] = me.role === 'admin' ? ADMIN_TABS : FREELANCER_TABS
  const [tab, setTab] = useState<Tab>(tabs[0])

  const toReview = tasks.filter((t) => t.status === 'submitted' || t.status === 'approved')
  const mine = tasks.filter((t) => t.assigneeUid === me.uid)
  const counts: Partial<Record<Tab, number>> = {
    Review: toReview.length,
    'Open tasks': tasks.filter((t) => t.status === 'open').length,
    'My tasks': mine.filter((t) => t.status === 'assigned' || t.status === 'changes').length,
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="wordmark">
            BoromTech <span>Crew</span>
          </span>
          <nav aria-label="Sections">
            {tabs.map((t) => (
              <button key={t} className={t === tab ? 'tab active' : 'tab'} aria-current={t === tab ? 'page' : undefined} onClick={() => setTab(t)}>
                {t}
                {!!counts[t] && <span className="count">{counts[t]}</span>}
              </button>
            ))}
          </nav>
          <div className="me">
            {me.photo && <img src={me.photo} alt="" referrerPolicy="no-referrer" />}
            <span className="me-name">
              {me.name}
              <small>{me.role === 'admin' ? 'Admin' : 'Freelancer'}</small>
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main>
        {error && (
          <p className="error" role="alert">
            {error.message}{' '}
            <Button variant="ghost" size="sm" onClick={dismissError}>
              Dismiss
            </Button>
          </p>
        )}
        <h2 className="title">{tab}</h2>
        {tab === 'Jobs' && <JobsView jobs={jobs} tasks={tasks} />}
        {tab === 'Review' && <TaskGrid tasks={toReview} empty="Nothing waiting for review." />}
        {tab === 'Open tasks' && <TaskGrid tasks={tasks.filter((t) => t.status === 'open')} empty="No open tasks right now. New ones appear here as soon as they're posted." />}
        {tab === 'My tasks' && <TaskGrid tasks={mine} empty="You haven't claimed any tasks yet. Pick one from Open tasks." />}
        {tab === 'Leaderboard' && <Leaderboard members={members} tasks={tasks} me={me} />}
        {tab === 'Invites' && <InvitesView invites={invites} />}
      </main>
    </div>
  )
}

function JobsView({ jobs, tasks }: { jobs: Job[]; tasks: Task[] }) {
  const [form, setForm] = useState({ title: '', customer: '', description: '', customerDeadline: toDateInput(Date.now() + 30 * DAY) })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await run('create_job', form).then(() => setForm({ ...form, title: '', customer: '', description: '' }), ignore)
  }
  return (
    <>
      <form className="panel form" onSubmit={submit}>
        <h3>New client job</h3>
        <div className="fields">
          <Field label="Job title">
            <input id="job-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Client">
            <input id="job-client" required value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
          </Field>
          <Field label="Client deadline">
            <input id="job-deadline" type="date" required value={form.customerDeadline} onChange={(e) => setForm({ ...form, customerDeadline: e.target.value })} />
          </Field>
        </div>
        <Field label="Scope and notes">
          <textarea id="job-notes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Button variant="primary" type="submit">
          Create job
        </Button>
      </form>
      {jobs.length === 0 && <p className="muted">No jobs yet. Create one above, then split it into tasks.</p>}
      {jobs.map((job) => (
        <JobPanel key={job.id} job={job} tasks={tasks.filter((t) => t.jobId === job.id)} />
      ))}
    </>
  )
}

function JobPanel({ job, tasks }: { job: Job; tasks: Task[] }) {
  const blank = () => ({ title: '', description: '', payout: '', freelancerDeadline: defaultFreelancerDeadline(job.customerDeadline) })
  const [draft, setDraft] = useState(blank)
  const verified = tasks.filter((t) => t.status === 'approved' || t.status === 'paid').length
  const budget = tasks.reduce((s, t) => s + t.payout, 0)
  const add = async (e: FormEvent) => {
    e.preventDefault()
    await run('create_task', { jobId: job.id, ...draft, payout: Number(draft.payout) }).then(() => setDraft(blank()), ignore)
  }
  return (
    <section className="panel">
      <div className="job-head">
        <div>
          <h3>{job.title}</h3>
          <p className="muted small">
            {job.customer} · client due {job.customerDeadline} · <span className="mono">฿{budget.toLocaleString('en-US')}</span> in tasks
          </p>
        </div>
        <div className="progress-wrap">
          <span className="small muted">
            {verified}/{tasks.length} verified
          </span>
          <div className="progress" role="progressbar" aria-valuenow={verified} aria-valuemax={tasks.length}>
            <div style={{ width: `${tasks.length ? (verified / tasks.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>
      {job.description && <p className="job-desc">{job.description}</p>}
      {tasks.length > 0 && (
        <div className="grid">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} compact />
          ))}
        </div>
      )}
      <form className="add-task" onSubmit={add}>
        <Field label="Task">
          <input id={`task-title-${job.id}`} required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </Field>
        <Field label="Acceptance criteria">
          <input id={`task-desc-${job.id}`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <Field label="Payout (฿)">
          <input id={`task-payout-${job.id}`} required type="number" min="0" inputMode="numeric" value={draft.payout} onChange={(e) => setDraft({ ...draft, payout: e.target.value })} />
        </Field>
        <Field label="Freelancer due" hint="Half the client runway">
          <input id={`task-due-${job.id}`} type="date" required value={draft.freelancerDeadline} onChange={(e) => setDraft({ ...draft, freelancerDeadline: e.target.value })} />
        </Field>
        <Button type="submit">Add task</Button>
      </form>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <em> · {hint}</em>}
      </span>
      {children}
    </label>
  )
}

function TaskGrid({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (tasks.length === 0) return <p className="empty">{empty}</p>
  return (
    <div className="grid">
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} />
      ))}
    </div>
  )
}

function TaskItem({ task, compact }: { task: Task; compact?: boolean }) {
  const { actions } = task
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [grade, setGrade] = useState(4)
  const [feedback, setFeedback] = useState('')

  return (
    <TaskCard
      status={task.status}
      title={task.title}
      project={compact ? undefined : task.jobTitle}
      description={task.description}
      payout={task.payout}
      due={task.freelancerDeadline}
      assignee={task.assigneeName}
      submission={task.submissionUrl}
      review={task.review}
      compact={compact}
    >
      {actions.length > 0 && (
        <>
          {actions.includes('claim') && (
            <Button variant="primary" onClick={() => run('claim_task', { taskId: task.id }).catch(ignore)}>
              Claim task
            </Button>
          )}
          {actions.includes('submit') && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                run('submit_task', { taskId: task.id, url, note }).catch(ignore)
              }}
            >
              <input id={`sub-url-${task.id}`} required type="url" placeholder="https:// link to your work" aria-label="Link to your work" value={url} onChange={(e) => setUrl(e.target.value)} />
              <input id={`sub-note-${task.id}`} placeholder="Note for the reviewer" aria-label="Note for the reviewer" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button variant="primary" type="submit">
                {task.status === 'changes' ? 'Resubmit for review' : 'Submit for review'}
              </Button>
            </form>
          )}
          {actions.includes('approve') && (
            <div className="stack">
              <StarRating value={grade} onChange={setGrade} />
              <input id={`fb-${task.id}`} placeholder="Feedback for the freelancer" aria-label="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              <div className="row">
                <Button variant="primary" onClick={() => run('approve_task', { taskId: task.id, grade, feedback }).catch(ignore)}>
                  Pass & grade
                </Button>
                <Button variant="danger" onClick={() => run('reject_task', { taskId: task.id, feedback: feedback || 'Please revise.' }).catch(ignore)}>
                  Request changes
                </Button>
              </div>
            </div>
          )}
          {actions.includes('pay') && (
            <Button variant="primary" onClick={() => run('pay_task', { taskId: task.id }).catch(ignore)}>
              Mark ฿{task.payout.toLocaleString('en-US')} paid
            </Button>
          )}
        </>
      )}
    </TaskCard>
  )
}

function Leaderboard({ members, tasks, me }: { members: Member[]; tasks: Task[]; me: Member }) {
  const standings = rank(members, tasks)
  if (standings.length === 0) return <p className="empty">No freelancers yet. Invite some from the Invites tab.</p>
  return (
    <section className="panel">
      <p className="muted small">Score is 70% average grade and 30% on-time rate, minus 2 points per rework, building up over the first 3 verified tasks.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Freelancer</th>
              <th>Tier</th>
              <th className="num">Verified</th>
              <th className="num">Avg grade</th>
              <th className="num">On time</th>
              <th className="num">Earned</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.member.uid} className={s.member.uid === me.uid ? 'mine' : ''}>
                <td className="num">{i + 1}</td>
                <td>{s.member.name}</td>
                <td>
                  <TierBadge tier={s.tier} score={s.completed ? s.score : undefined} />
                </td>
                <td className="num">{s.completed}</td>
                <td className="num">{s.completed ? s.avgGrade.toFixed(1) : '–'}</td>
                <td className="num">{s.completed ? `${Math.round(s.onTimeRate * 100)}%` : '–'}</td>
                <td className="num">฿{s.earned.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function InvitesView({ invites }: { invites: Invite[] }) {
  const [email, setEmail] = useState('')
  return (
    <section className="panel form">
      <form
        className="add-task"
        onSubmit={async (e) => {
          e.preventDefault()
          await run('invite', { email }).then(() => setEmail(''), ignore)
        }}
      >
        <Field label="Google account email">
          <input id="invite-email" required type="email" placeholder="freelancer@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button variant="primary" type="submit">
          Invite
        </Button>
      </form>
      <p className="muted small">They sign in with that Google account. Send them the site link yourself; no email goes out.</p>
      {invites.length > 0 && (
        <ul className="invites">
          {invites.map((i) => (
            <li key={i.email}>
              <span className="mono">{i.email}</span>
              {i.joined ? (
                <>
                  <span className="joined">Joined</span>
                  <Button variant="danger" size="sm" onClick={() => i.uid && run('remove_member', { uid: i.uid }).catch(ignore)}>
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <span className="muted small">Pending</span>
                  <Button variant="danger" size="sm" onClick={() => run('revoke_invite', { email: i.email }).catch(ignore)}>
                    Revoke
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
