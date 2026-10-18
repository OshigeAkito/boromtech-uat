// @boromtech/domain — the vocabulary the job board renders and the contract it speaks to Postgres.
//
// Postgres (apps/job-board/db/api.sql) decides every state transition and who may make it. Nothing in
// this package is a rule the server relies on. The value lists below mirror SQL enums and the cmd schema;
// apps/job-board/db/test/contract.test.ts fails CI when they drift.
//
// There is no TRANSITIONS table here: the server ships `task.actions` (what this viewer may do to this
// task now), computed from the one state machine in SQL.

export * from './commands.ts'

/** Mirrors `app.task_status`. */
export const TASK_STATUSES = ['open', 'assigned', 'changes', 'submitted', 'approved', 'paid'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Mirrors `app.task_action`. */
export const TASK_ACTIONS = ['claim', 'submit', 'approve', 'reject', 'pay'] as const
export type TaskAction = (typeof TASK_ACTIONS)[number]

export type Role = 'admin' | 'freelancer'
export type Tier = 'Gold' | 'Silver' | 'Bronze' | 'Rookie' | 'Unranked'

export interface Member {
  /** Google OIDC `sub`. */
  uid: string
  /** Lowercased. `null` when the viewer may not see it (freelancers see only their own). */
  email: string | null
  name: string
  photo: string
  role: Role
}

export interface Job {
  id: string
  title: string
  customer: string
  description: string
  /** 'YYYY-MM-DD'. */
  customerDeadline: string
  /** Epoch millis, server clock. */
  createdAt: number
}

/** Latest review. `grade` is 1..5 when approved and 0 when changes were requested. */
export interface Review {
  verdict: 'approved' | 'changes'
  grade: number
  /** Absent when the viewer is neither an admin nor the assignee. */
  feedback?: string
  at: number
}

export interface Task {
  id: string
  jobId: string
  /** Joined from `jobs` on the client; never stored on the task. */
  jobTitle: string
  title: string
  description: string
  /** Whole THB. */
  payout: number
  /** 'YYYY-MM-DD'. */
  freelancerDeadline: string
  status: TaskStatus
  assigneeUid: string | null
  /** Joined from `members` on the client. */
  assigneeName: string | null
  /** `null` unless the viewer is an admin or the assignee. */
  submissionUrl: string | null
  submissionNote: string | null
  /** Server time of the submit, epoch millis. */
  submittedAt: number | null
  review: Review | null
  /** Changes-requested reviews while the current assignee held the task. Derived in SQL. */
  rejections: number
  /** What the viewer may do to this task now, from the SQL state machine. */
  actions: TaskAction[]
}

export interface Invite {
  email: string
  createdAt: number
  /** True once someone has signed in with this email. */
  joined: boolean
  /** Their uid when joined, so an admin can remove them. */
  uid: string | null
}

const DAY = 86_400_000

export function toDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// Freelancers get half the customer's runway so we keep the other half for verification and rework.
export function defaultFreelancerDeadline(customerDeadline: string, now = Date.now()): string {
  const end = Date.parse(customerDeadline)
  const half = Math.max(DAY, Math.floor((end - now) / 2))
  return toDateInput(now + half)
}

export function isOnTime(task: Task): boolean {
  return task.submittedAt !== null && task.submittedAt <= Date.parse(task.freelancerDeadline) + DAY
}

export interface Standing {
  member: Member
  completed: number
  avgGrade: number
  onTimeRate: number
  earned: number
  score: number
  tier: Tier
}

const TIERS: [number, Tier][] = [
  [85, 'Gold'],
  [65, 'Silver'],
  [40, 'Bronze'],
  [0, 'Rookie'],
]

// Score blends quality (70%) and punctuality (30%), with a confidence ramp so one lucky task doesn't top the board.
export function rank(members: Member[], tasks: Task[]): Standing[] {
  return members
    .filter((m) => m.role === 'freelancer')
    .map((member) => {
      const done = tasks.filter((t) => t.assigneeUid === member.uid && t.review && (t.status === 'approved' || t.status === 'paid'))
      const completed = done.length
      const avgGrade = completed ? done.reduce((s, t) => s + t.review!.grade, 0) / completed : 0
      const onTimeRate = completed ? done.filter(isOnTime).length / completed : 0
      const earned = done.filter((t) => t.status === 'paid').reduce((s, t) => s + t.payout, 0)
      const reworkPenalty = done.reduce((s, t) => s + t.rejections, 0) * 2
      const confidence = Math.min(1, completed / 3)
      const raw = (avgGrade / 5) * 70 + onTimeRate * 30 - reworkPenalty
      const score = Math.max(0, Math.round(raw * confidence))
      const tier = completed ? TIERS.find(([min]) => score >= min)![1] : 'Unranked'
      return { member, completed, avgGrade, onTimeRate, earned, score, tier }
    })
    .sort((a, b) => b.score - a.score || b.completed - a.completed)
}
