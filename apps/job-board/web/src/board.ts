// The merged client copy of everything the viewer may see, and the wire shapes it is built from.
// Pure: no fetch, no timers, no React. Only api.ts imports it.
import type { ErrorCode, Invite, Job, Member, Review, Task, TaskAction, TaskStatus } from '@boromtech/domain'

/** Everything a signed-in member sees, joined and sorted. */
export interface MemberView {
  state: 'member'
  me: Member
  /** createdAt desc. */
  jobs: Job[]
  /** freelancerDeadline desc. */
  tasks: Task[]
  /** Live members, name asc. */
  members: Member[]
  /** Pending and joined invites, createdAt desc. Empty for freelancers. */
  invites: Invite[]
}

interface Versioned {
  version: number
}
export type MemberRow = Member & Versioned & { removed: boolean }
export type JobRow = Job & Versioned
export type InviteRow = { email: string; createdAt: number; revoked: boolean } & Versioned
export interface TaskRow extends Versioned {
  id: string
  jobId: string
  title: string
  description: string
  payout: number
  freelancerDeadline: string
  status: TaskStatus
  assigneeUid: string | null
  submissionUrl: string | null
  submissionNote: string | null
  submittedAt: number | null
  review: (Omit<Review, 'feedback'> & { feedback: string | null }) | null
  rejections: number
  actions: TaskAction[]
}

/** What gate.call returns: lib.changes(...) plus { status, result, error }. */
export interface Wire {
  status: number
  cursor: number
  me: MemberRow
  jobs: JobRow[]
  tasks: TaskRow[]
  members: MemberRow[]
  invites: InviteRow[]
  result?: unknown
  error: { code: ErrorCode; message: string } | null
}

/**
 * Holds the merged rows and derives the public Board. `apply` is idempotent and order-insensitive:
 * a row replaces the stored one only when its version is higher, and the cursor only moves forward.
 * Concurrent requests are safe because each response covers (since, cursor] with since ≤ our cursor.
 */
export class BoardState {
  cursor = 0
  me: MemberRow | null = null
  jobs = new Map<string, JobRow>()
  tasks = new Map<string, TaskRow>()
  members = new Map<string, MemberRow>()
  invites = new Map<string, InviteRow>()

  apply(w: Wire): void {
    if (w.me && (!this.me || w.me.version >= this.me.version)) this.me = w.me
    merge(this.jobs, w.jobs, (r) => r.id)
    merge(this.tasks, w.tasks, (r) => r.id)
    merge(this.members, w.members, (r) => r.uid)
    merge(this.invites, w.invites, (r) => r.email)
    this.cursor = Math.max(this.cursor, w.cursor)
  }

  view(): MemberView {
    const live = [...this.members.values()].filter((m) => !m.removed)
    const names = new Map(live.map((m) => [m.uid, m.name]))
    const titles = new Map([...this.jobs.values()].map((j) => [j.id, j.title]))
    const byEmail = new Map(live.filter((m) => m.email).map((m) => [m.email!, m.uid]))
    return {
      state: 'member',
      me: member(this.me!),
      jobs: [...this.jobs.values()].map(job).sort((a, b) => b.createdAt - a.createdAt),
      tasks: [...this.tasks.values()]
        .map((t): Task => ({
          ...strip(t),
          jobTitle: titles.get(t.jobId) ?? '',
          assigneeName: t.assigneeUid ? (names.get(t.assigneeUid) ?? 'Former member') : null,
          review: t.review && { verdict: t.review.verdict, grade: t.review.grade, at: t.review.at, ...(t.review.feedback !== null && { feedback: t.review.feedback }) },
        }))
        .sort((a, b) => b.freelancerDeadline.localeCompare(a.freelancerDeadline) || a.title.localeCompare(b.title)),
      members: live.map(member).sort((a, b) => a.name.localeCompare(b.name)),
      invites: [...this.invites.values()]
        .filter((i) => !i.revoked)
        .map((i): Invite => ({ email: i.email, createdAt: i.createdAt, joined: byEmail.has(i.email), uid: byEmail.get(i.email) ?? null }))
        .sort((a, b) => b.createdAt - a.createdAt),
    }
  }
}

function merge<R extends Versioned>(into: Map<string, R>, rows: R[], key: (r: R) => string): void {
  for (const r of rows) {
    const prev = into.get(key(r))
    if (!prev || r.version > prev.version) into.set(key(r), r)
  }
}

const member = ({ uid, email, name, photo, role }: MemberRow): Member => ({ uid, email, name, photo, role })
const job = ({ id, title, customer, description, customerDeadline, createdAt }: JobRow): Job => ({ id, title, customer, description, customerDeadline, createdAt })
const strip = ({ version: _v, review: _r, ...t }: TaskRow) => t

