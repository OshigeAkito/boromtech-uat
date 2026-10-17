import type { TaskStatus, Tier } from '@boromtech/design-system/components/src'

export type { TaskStatus, Tier }

export type Role = 'admin' | 'freelancer'

export interface Member {
  uid: string
  email: string
  name: string
  photo: string
  role: Role
}

export interface Job {
  id: string
  title: string
  customer: string
  description: string
  customerDeadline: string
  createdAt: number
}

export interface Review {
  grade: number
  feedback: string
  at: number
}

export interface Task {
  id: string
  jobId: string
  jobTitle: string
  title: string
  description: string
  payout: number
  freelancerDeadline: string
  status: TaskStatus
  assigneeUid: string | null
  assigneeName: string | null
  submissionUrl: string | null
  submissionNote: string | null
  submittedAt: number | null
  review: Review | null
  rejections: number
}

export type TaskAction = 'claim' | 'submit' | 'approve' | 'reject' | 'pay'

export const TRANSITIONS: Record<TaskAction, { from: TaskStatus[]; to: TaskStatus; by: Role | 'assignee' | 'member' }> = {
  claim: { from: ['open'], to: 'assigned', by: 'member' },
  submit: { from: ['assigned', 'changes'], to: 'submitted', by: 'assignee' },
  approve: { from: ['submitted'], to: 'approved', by: 'admin' },
  reject: { from: ['submitted'], to: 'changes', by: 'admin' },
  pay: { from: ['approved'], to: 'paid', by: 'admin' },
}

export function allowedActions(task: Task, me: Member): TaskAction[] {
  return (Object.keys(TRANSITIONS) as TaskAction[]).filter((action) => {
    const t = TRANSITIONS[action]
    if (!t.from.includes(task.status)) return false
    if (t.by === 'admin') return me.role === 'admin'
    if (t.by === 'assignee') return task.assigneeUid === me.uid
    return me.role === 'freelancer'
  })
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
