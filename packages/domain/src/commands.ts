// The command contract between the SPA and Postgres.
//
// Every key of `Commands` is the name of exactly one SQL function `cmd.<name>(me app.members, args jsonb)`
// in apps/job-board/db/api.sql. The transport never sees this list: it forwards `{ name, args }` to
// `gate.call`, which resolves the function by name inside the `cmd` schema. Grep a command name and you
// find its TS call sites and its SQL body — nothing in between.
//
// Results carry only what a caller may await (e.g. the new job's id). State comes from the delta in the
// same response, never from the result.

import type { Job, Task, TaskStatus } from './index.ts'

type TaskRef = { taskId: string }
type TaskResult = { id: string; status: TaskStatus }

export interface Commands {
  // ---- task state machine (actor checks + from-states live in SQL lib.transitions()) ----
  claim_task: { args: TaskRef; result: TaskResult }
  submit_task: { args: TaskRef & { url: string; note: string }; result: TaskResult }
  approve_task: { args: TaskRef & { grade: number; feedback: string }; result: TaskResult }
  reject_task: { args: TaskRef & { feedback: string }; result: TaskResult }
  pay_task: { args: TaskRef; result: TaskResult }
  // ---- admin authoring ----
  create_job: { args: Pick<Job, 'title' | 'customer' | 'description' | 'customerDeadline'>; result: { id: string } }
  create_task: {
    args: { jobId: string } & Pick<Task, 'title' | 'description' | 'payout' | 'freelancerDeadline'>
    result: TaskResult
  }
  // ---- membership (admin) ----
  invite: { args: { email: string }; result: { email: string } }
  revoke_invite: { args: { email: string }; result: null }
  remove_member: { args: { uid: string }; result: { uid: string } }
}

export type CommandName = keyof Commands

/** Runtime list for the contract test (TS ↔ `cmd` schema). The type below makes omissions a compile error. */
export const COMMAND_NAMES = [
  'claim_task',
  'submit_task',
  'approve_task',
  'reject_task',
  'pay_task',
  'create_job',
  'create_task',
  'invite',
  'revoke_invite',
  'remove_member',
] as const satisfies readonly CommandName[]
type _AllCommandsListed = Exclude<CommandName, (typeof COMMAND_NAMES)[number]> extends never ? true : never
true satisfies _AllCommandsListed

/**
 * Stable error tokens raised by SQL (`lib.fail(code, …)`, SQLSTATE 'BT000') and returned by `gate.*`.
 * Mirrors `lib.errors()`; HTTP status mapping lives only in SQL. Contract-tested.
 */
export const ERROR_CODES = [
  'not_signed_in', // 401 — no/expired session, or member removed
  'not_invited', // 403 — sign-in: email has no live invite and is not on the admin allowlist
  'email_unverified', // 403 — sign-in: Google says the email is unverified
  'removed', // 403 — sign-in: member was removed by an admin
  'not_allowed', // 403 — wrong actor for this command
  'not_found', // 404
  'claim_lost', // 409 — someone else claimed first (the compare-and-set lost)
  'wrong_state', // 409 — task not in a from-state for this action
  'invalid', // 422 — argument failed validation; message says which
  'unknown_command', // 400
  'bad_request', // 400
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]
