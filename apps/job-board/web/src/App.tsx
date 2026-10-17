import { onAuthStateChanged } from 'firebase/auth'
import { useEffect, useState, type FormEvent } from 'react'
import {
  STATUS_LABEL,
  allowedActions,
  defaultFreelancerDeadline,
  rank,
  toDateInput,
  type Job,
  type Member,
  type Task,
} from './domain'
import * as fb from './firebase'

type Session =
  | { state: 'loading' }
  | { state: 'signedOut'; error?: string }
  | { state: 'member'; me: Member }

export default function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' })

  useEffect(
    () =>
      onAuthStateChanged(fb.auth, async (user) => {
        if (!user) return setSession((s) => (s.state === 'signedOut' ? s : { state: 'signedOut' }))
        try {
          setSession({ state: 'member', me: await fb.enroll(user) })
        } catch (e) {
          await fb.logOut()
          setSession({
            state: 'signedOut',
            error: e instanceof fb.NotInvitedError ? `${e.message} has not been invited yet. Ask an admin for an invite.` : String(e),
          })
        }
      }),
    [],
  )

  if (session.state === 'loading') return <div className="center muted">Loading…</div>
  if (session.state === 'signedOut') return <Landing error={session.error} />
  return <Workspace me={session.me} />
}

function Landing({ error: enrollError }: { error?: string }) {
  const [signInError, setSignInError] = useState<string>()
  const error = signInError ?? enrollError
  const start = () =>
    fb.signIn().catch((e: { code?: string; message?: string }) => {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return
      setSignInError(`Sign-in failed (${e.code ?? e.message}).`)
    })
  return (
    <div className="center">
      <div className="landing">
        <p className="eyebrow">Invite only</p>
        <h1>Crew</h1>
        <p className="muted">Small, well-scoped tasks from real client projects. Ship on time, get graded, get paid, climb the board.</p>
        <button className="primary big" onClick={start}>
          Continue with Google
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}

const ADMIN_TABS = ['Jobs', 'Review', 'Leaderboard', 'Invites'] as const
const FREELANCER_TABS = ['Open tasks', 'My tasks', 'Leaderboard'] as const
type Tab = (typeof ADMIN_TABS)[number] | (typeof FREELANCER_TABS)[number]

function Workspace({ me }: { me: Member }) {
  const tabs: readonly Tab[] = me.role === 'admin' ? ADMIN_TABS : FREELANCER_TABS
  const [tab, setTab] = useState<Tab>(tabs[0])
  const [jobs, setJobs] = useState<Job[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    const subs = [fb.watchJobs(setJobs), fb.watchTasks(setTasks), fb.watchMembers(setMembers)]
    return () => subs.forEach((u) => u())
  }, [])

  const reviewCount = tasks.filter((t) => t.status === 'submitted' || t.status === 'approved').length

  return (
    <div className="shell">
      <header>
        <strong className="logo">Crew</strong>
        <nav>
          {tabs.map((t) => (
            <button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
              {t}
              {t === 'Review' && reviewCount > 0 && <span className="pill">{reviewCount}</span>}
            </button>
          ))}
        </nav>
        <div className="me">
          {me.photo && <img src={me.photo} alt="" referrerPolicy="no-referrer" />}
          <span>
            {me.name} <em className="muted">· {me.role}</em>
          </span>
          <button className="ghost" onClick={fb.logOut}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        {tab === 'Jobs' && <JobsView jobs={jobs} tasks={tasks} me={me} />}
        {tab === 'Review' && (
          <TaskList me={me} tasks={tasks.filter((t) => t.status === 'submitted' || t.status === 'approved')} empty="Nothing waiting for review." />
        )}
        {tab === 'Open tasks' && <TaskList me={me} tasks={tasks.filter((t) => t.status === 'open')} empty="No open tasks right now. Check back soon." />}
        {tab === 'My tasks' && <TaskList me={me} tasks={tasks.filter((t) => t.assigneeUid === me.uid)} empty="You haven't claimed any tasks yet." />}
        {tab === 'Leaderboard' && <Leaderboard members={members} tasks={tasks} me={me} />}
        {tab === 'Invites' && <InvitesView members={members} />}
      </main>
    </div>
  )
}

function JobsView({ jobs, tasks, me }: { jobs: Job[]; tasks: Task[]; me: Member }) {
  const [form, setForm] = useState({ title: '', customer: '', description: '', customerDeadline: toDateInput(Date.now() + 30 * 86_400_000) })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await fb.createJob(form)
    setForm({ ...form, title: '', customer: '', description: '' })
  }
  return (
    <>
      <form className="card form" onSubmit={submit}>
        <h3>New customer job</h3>
        <div className="row">
          <input required placeholder="Job title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input required placeholder="Customer" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
          <label>
            Customer deadline
            <input type="date" required value={form.customerDeadline} onChange={(e) => setForm({ ...form, customerDeadline: e.target.value })} />
          </label>
        </div>
        <textarea placeholder="Scope / notes" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="primary">Create job</button>
      </form>
      {jobs.length === 0 && <p className="muted">No jobs yet. Create one above, then split it into tasks.</p>}
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} tasks={tasks.filter((t) => t.jobId === job.id)} me={me} />
      ))}
    </>
  )
}

function JobCard({ job, tasks, me }: { job: Job; tasks: Task[]; me: Member }) {
  const blank = () => ({ title: '', description: '', payout: '', freelancerDeadline: defaultFreelancerDeadline(job.customerDeadline) })
  const [draft, setDraft] = useState(blank)
  const done = tasks.filter((t) => t.status === 'approved' || t.status === 'paid').length
  const add = async (e: FormEvent) => {
    e.preventDefault()
    await fb.createTask(job, { ...draft, payout: Number(draft.payout) })
    setDraft(blank())
  }
  return (
    <section className="card">
      <div className="job-head">
        <div>
          <h3>{job.title}</h3>
          <p className="muted">
            {job.customer} · customer due {job.customerDeadline} · {done}/{tasks.length} tasks verified
          </p>
        </div>
        <Progress value={tasks.length ? done / tasks.length : 0} />
      </div>
      {job.description && <p>{job.description}</p>}
      <div className="tasks">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} me={me} compact />
        ))}
      </div>
      <form className="row add-task" onSubmit={add}>
        <input required placeholder="Simple task title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input placeholder="Details / acceptance criteria" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <input required type="number" min="0" placeholder="Payout" value={draft.payout} onChange={(e) => setDraft({ ...draft, payout: e.target.value })} />
        <label title="Defaults to half the customer runway">
          Freelancer due
          <input type="date" required value={draft.freelancerDeadline} onChange={(e) => setDraft({ ...draft, freelancerDeadline: e.target.value })} />
        </label>
        <button className="primary">Add task</button>
      </form>
    </section>
  )
}

function TaskList({ tasks, me, empty }: { tasks: Task[]; me: Member; empty: string }) {
  if (tasks.length === 0) return <p className="muted">{empty}</p>
  return (
    <div className="grid">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} me={me} />
      ))}
    </div>
  )
}

function TaskCard({ task, me, compact }: { task: Task; me: Member; compact?: boolean }) {
  const actions = allowedActions(task, me)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [grade, setGrade] = useState(4)
  const [feedback, setFeedback] = useState('')
  const overdue = task.status === 'assigned' && Date.parse(task.freelancerDeadline) + 86_400_000 < Date.now()

  return (
    <article className={`task ${compact ? 'compact' : ''}`}>
      <div className="task-head">
        <span className={`status s-${task.status}`}>{STATUS_LABEL[task.status]}</span>
        <span className="payout">฿{task.payout.toLocaleString()}</span>
      </div>
      <h4>{task.title}</h4>
      {!compact && <p className="muted small">{task.jobTitle}</p>}
      {task.description && <p className="small">{task.description}</p>}
      <p className={`small ${overdue ? 'error' : 'muted'}`}>
        Due {task.freelancerDeadline}
        {overdue && ' · overdue'}
        {task.assigneeName && ` · ${task.assigneeName}`}
      </p>
      {task.submissionUrl && (
        <p className="small">
          Submission:{' '}
          <a href={task.submissionUrl} target="_blank" rel="noreferrer">
            {task.submissionUrl}
          </a>
          {task.submissionNote && <span className="muted"> · {task.submissionNote}</span>}
        </p>
      )}
      {task.review && (
        <p className={`small ${task.review.grade ? '' : 'error'}`}>
          {task.review.grade ? `Grade ${'★'.repeat(task.review.grade)}${'☆'.repeat(5 - task.review.grade)}` : 'Changes requested'}
          {task.review.feedback && ` · ${task.review.feedback}`}
        </p>
      )}

      {actions.includes('claim') && (
        <button className="primary" onClick={() => fb.claimTask(task.id, me)}>
          Claim task
        </button>
      )}
      {actions.includes('submit') && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            fb.submitTask(task.id, url, note)
          }}
        >
          <input required type="url" placeholder="Link to your work" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input placeholder="Note for reviewer" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="primary">Submit for verification</button>
        </form>
      )}
      {actions.includes('approve') && (
        <div className="stack">
          <div className="stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={n <= grade ? 'star on' : 'star'} onClick={() => setGrade(n)}>
                ★
              </button>
            ))}
          </div>
          <input placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <div className="row">
            <button className="primary" onClick={() => fb.approveTask(task.id, grade, feedback)}>
              Pass & grade
            </button>
            <button className="ghost danger" onClick={() => fb.rejectTask(task.id, feedback || 'Please revise.')}>
              Request changes
            </button>
          </div>
        </div>
      )}
      {actions.includes('pay') && (
        <button className="primary" onClick={() => fb.payTask(task.id)}>
          Mark ฿{task.payout.toLocaleString()} paid
        </button>
      )}
    </article>
  )
}

function Leaderboard({ members, tasks, me }: { members: Member[]; tasks: Task[]; me: Member }) {
  const standings = rank(members, tasks)
  if (standings.length === 0) return <p className="muted">No freelancers yet.</p>
  return (
    <section className="card">
      <h3>Freelancer ranking</h3>
      <p className="muted small">Score = 70% average grade + 30% on-time rate, minus rework, ramped up over the first 3 verified tasks.</p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Freelancer</th>
            <th>Tier</th>
            <th>Score</th>
            <th>Verified</th>
            <th>Avg grade</th>
            <th>On time</th>
            <th>Earned</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.member.uid} className={s.member.uid === me.uid ? 'mine' : ''}>
              <td>{i + 1}</td>
              <td>{s.member.name}</td>
              <td>
                <span className={`tier t-${s.tier.toLowerCase()}`}>{s.tier}</span>
              </td>
              <td>
                <strong>{s.score}</strong>
              </td>
              <td>{s.completed}</td>
              <td>{s.completed ? s.avgGrade.toFixed(1) : '·'}</td>
              <td>{s.completed ? `${Math.round(s.onTimeRate * 100)}%` : '·'}</td>
              <td>฿{s.earned.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function InvitesView({ members }: { members: Member[] }) {
  const [invites, setInvites] = useState<{ id: string }[]>([])
  const [email, setEmail] = useState('')
  useEffect(() => fb.watchInvites(setInvites), [])
  const joined = new Set(members.map((m) => m.email))
  return (
    <section className="card">
      <h3>Invite freelancers</h3>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault()
          await fb.invite(email)
          setEmail('')
        }}
      >
        <input required type="email" placeholder="freelancer@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="primary">Send invite</button>
      </form>
      <p className="muted small">They sign in with that Google account. Share the site link with them yourself.</p>
      <ul className="invites">
        {invites.map((i) => (
          <li key={i.id}>
            {i.id} <span className={joined.has(i.id) ? 'status s-paid' : 'status s-open'}>{joined.has(i.id) ? 'Joined' : 'Pending'}</span>
            {!joined.has(i.id) && (
              <button className="ghost danger" onClick={() => fb.revokeInvite(i.id)}>
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}
