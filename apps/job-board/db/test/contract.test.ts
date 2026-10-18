// Contract + invariant tests. They call gate.* exactly as the Worker does, connected as bt_gateway, against
// a real Postgres. No mocks: the database is the server.
//
// Run: OWNER_URL=postgres://postgres:owner@localhost:55432/postgres npm test -w job-board-db
// Each run creates a fresh database `bt_test` on that server and migrates it with ../migrate.sh.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import pg from 'pg'
import { COMMAND_NAMES, ERROR_CODES, TASK_ACTIONS, TASK_STATUSES } from '@boromtech/domain'

const OWNER_URL = process.env.OWNER_URL ?? 'postgres://postgres:owner@localhost:55432/postgres'
const DB = 'bt_test'
const dbUrl = (user?: string, password?: string) => {
  const u = new URL(OWNER_URL)
  u.pathname = `/${DB}`
  if (user) u.username = user
  if (password) u.password = password
  return u.toString()
}

let owner: pg.Client
const gateways: pg.Client[] = []

async function gateway(): Promise<pg.Client> {
  const c = new pg.Client(dbUrl('bt_gateway', 'test-gateway'))
  await c.connect()
  gateways.push(c)
  return c
}

before(async () => {
  const admin = new pg.Client(OWNER_URL)
  await admin.connect()
  await admin.query(`drop database if exists ${DB} with (force)`)
  await admin.query(`create database ${DB}`)
  await admin.end()
  execFileSync(new URL('../migrate.sh', import.meta.url).pathname, { env: { ...process.env, DATABASE_URL: dbUrl() }, stdio: 'pipe' })
  owner = new pg.Client(dbUrl())
  await owner.connect()
  await owner.query(`alter role bt_gateway password 'test-gateway'`)
})

after(async () => {
  await Promise.all(gateways.map((c) => c.end()))
  await owner?.end()
})

type Envelope = Record<string, any> & { status: number; error: { code: string; message: string } | null }

// ---- lists that exist in both TS and SQL: CI fails when they disagree -------------------------------

describe('TS ↔ SQL contract', () => {
  test('cmd schema functions == COMMAND_NAMES', async () => {
    const { rows } = await owner.query(`select proname from pg_proc where pronamespace = 'cmd'::regnamespace order by 1`)
    assert.deepEqual(rows.map((r) => r.proname), [...COMMAND_NAMES].sort())
  })
  test('app.task_status enum == TASK_STATUSES, same order', async () => {
    const { rows } = await owner.query(`select unnest(enum_range(null::app.task_status))::text as v`)
    assert.deepEqual(rows.map((r) => r.v), [...TASK_STATUSES])
  })
  test('app.task_action enum == TASK_ACTIONS', async () => {
    const { rows } = await owner.query(`select unnest(enum_range(null::app.task_action))::text as v`)
    assert.deepEqual(rows.map((r) => r.v), [...TASK_ACTIONS])
  })
  test('lib.errors() codes == ERROR_CODES', async () => {
    const { rows } = await owner.query(`select code from lib.errors()`)
    assert.deepEqual(rows.map((r) => r.code).sort(), [...ERROR_CODES].sort())
  })
  test('every app table with a version column has the stamp trigger', async () => {
    const { rows } = await owner.query(`
      select c.table_name from information_schema.columns c
       where c.table_schema = 'app' and c.column_name = 'version'
         and not exists (select 1 from pg_trigger t where t.tgrelid = ('app.' || c.table_name)::regclass and t.tgname = 'stamp')`)
    assert.deepEqual(rows, [])
  })
})

// ---- the 12 firestore.rules invariants, plus the rules it never enforced ------------------------------

describe('invariants', () => {
  let gw: pg.Client
  let admin: string
  let f1: string
  let f2: string
  let jobId: string
  let taskId: string

  const signIn = async (identity: object) => (await gw.query('select gate.sign_in($1::jsonb) as r', [JSON.stringify(identity)])).rows[0].r as Envelope
  const call = async (token: string, body: object, client = gw) =>
    (await client.query('select gate.call($1, $2::jsonb) as r', [token, JSON.stringify(body)])).rows[0].r as Envelope
  const run = (token: string, name: string, args: object, requestId: string = randomUUID(), client = gw) =>
    call(token, { since: 0, command: { name, args, requestId } }, client)
  const task = async (token: string, id = taskId) => (await call(token, { since: 0 })).tasks.find((t: { id: string }) => t.id === id)

  before(async () => {
    gw = await gateway()
    admin = (await signIn({ sub: 'A', email: ' PongWasin@gmail.com ', email_verified: true, name: 'Pong' })).token
    assert.ok(admin)
  })

  test('1: no session or a bad token → 401', async () => {
    assert.equal((await call('', { since: 0 })).status, 401)
    assert.equal((await call('f'.repeat(64), { since: 0 })).status, 401)
  })

  test('2: allowlisted email enrolls as admin, stored lowercased', async () => {
    const r = await signIn({ sub: 'A', email: 'pongwasin@gmail.com', email_verified: true })
    assert.equal(r.me.role, 'admin')
    assert.equal(r.me.email, 'pongwasin@gmail.com')
  })

  test('3: freelancers need a live invite and a verified email', async () => {
    assert.equal((await signIn({ sub: 'F1', email: 'f1@x.com', email_verified: true })).error?.code, 'not_invited')
    assert.equal((await run(admin, 'invite', { email: ' F1@x.com ' })).status, 200)
    assert.equal((await run(admin, 'invite', { email: 'f2@x.com' })).status, 200)
    assert.equal((await run(admin, 'invite', { email: 'f3@x.com' })).status, 200)
    assert.equal((await signIn({ sub: 'F3', email: 'f3@x.com', email_verified: false })).error?.code, 'email_unverified')
    f1 = (await signIn({ sub: 'F1', email: 'f1@x.com', email_verified: true, name: 'Free One' })).token
    f2 = (await signIn({ sub: 'F2', email: 'f2@x.com', email_verified: true, name: 'Free Two' })).token
    assert.ok(f1 && f2)
  })

  test('7: only admins invite; invites are visible to admins only', async () => {
    assert.equal((await run(f1, 'invite', { email: 'z@z.com' })).error?.code, 'not_allowed')
    assert.equal((await call(f1, { since: 0 })).invites.length, 0)
    assert.ok((await call(admin, { since: 0 })).invites.length >= 3)
    assert.equal((await run(admin, 'invite', { email: 'not an email' })).error?.code, 'invalid')
  })

  test('8/9: only admins create jobs and tasks; a task cannot be due after its job', async () => {
    assert.equal((await run(f1, 'create_job', { title: 'X', customer: 'Y', description: '', customerDeadline: '2026-12-31' })).error?.code, 'not_allowed')
    jobId = (await run(admin, 'create_job', { title: 'Site', customer: 'Acme', description: '', customerDeadline: '2026-12-31' })).result.id
    const late = await run(admin, 'create_task', { jobId, title: 'Form', description: '', payout: 4500, freelancerDeadline: '2027-01-31' })
    assert.equal(late.error?.code, 'invalid')
    taskId = (await run(admin, 'create_task', { jobId, title: 'Form', description: '', payout: 4500, freelancerDeadline: '2026-12-01' })).result.id
    assert.ok(taskId)
  })

  test('10: claim is freelancer-only, open → assigned, and racing claims have one winner', async () => {
    assert.deepEqual((await task(f1)).actions, ['claim'])
    assert.deepEqual((await task(admin)).actions, [])
    assert.equal((await run(admin, 'claim_task', { taskId })).error?.code, 'not_allowed')

    const [a, b] = [await gateway(), await gateway()]
    const results = await Promise.all([run(f1, 'claim_task', { taskId }, randomUUID(), a), run(f2, 'claim_task', { taskId }, randomUUID(), b)])
    const winners = results.filter((r) => r.status === 200)
    assert.equal(winners.length, 1, JSON.stringify(results.map((r) => r.error)))
    assert.equal(results.find((r) => r.status !== 200)?.error?.code, 'claim_lost')

    // Make f1 the assignee for the rest of the suite regardless of who won the race.
    const t = await task(admin)
    if (t.assigneeUid !== 'F1') {
      await owner.query(`update app.tasks set assignee_uid = 'F1' where id = $1`, [taskId])
    }
    assert.equal((await run(f1, 'claim_task', { taskId })).status, 200, 'claiming your own task again is a no-op')
  })

  test('11: only the assignee submits, with an http(s) URL; submittedAt is server time', async () => {
    assert.equal((await run(f2, 'submit_task', { taskId, url: 'https://x.dev', note: '' })).error?.code, 'not_allowed')
    assert.equal((await run(f1, 'submit_task', { taskId, url: 'javascript:alert(1)', note: '' })).error?.code, 'invalid')
    assert.equal((await run(f1, 'submit_task', { taskId, url: 'https://x.dev/' + 'a'.repeat(2000), note: '' })).error?.code, 'invalid')
    const before = Date.now()
    assert.equal((await run(f1, 'submit_task', { taskId, url: 'https://github.com/x', note: 'done' })).status, 200)
    const t = await task(f1)
    assert.equal(t.status, 'submitted')
    assert.ok(Math.abs(t.submittedAt - before) < 60_000)
  })

  test('6/9: freelancers see no other emails, submissions or feedback', async () => {
    const view = await call(f2, { since: 0 })
    assert.deepEqual(view.members.filter((m: { uid: string }) => m.uid !== 'F2').map((m: { email: unknown }) => m.email), [null, null])
    const t = view.tasks.find((x: { id: string }) => x.id === taskId)
    assert.equal(t.submissionUrl, null)
    assert.equal((await task(admin)).submissionUrl, 'https://github.com/x')
  })

  test('12: transitions follow the state machine; grade is 1..5; rejections are derived', async () => {
    assert.equal((await run(admin, 'pay_task', { taskId })).error?.code, 'wrong_state')
    assert.equal((await run(f1, 'approve_task', { taskId, grade: 5, feedback: '' })).error?.code, 'not_allowed')
    const rejected = await run(admin, 'reject_task', { taskId, feedback: 'fix the header' })
    assert.equal(rejected.status, 200)
    assert.equal((await task(f1)).rejections, 1)
    assert.equal((await task(f1)).review.feedback, 'fix the header')
    assert.equal((await task(f2)).review.feedback, null)
    assert.equal((await run(f1, 'submit_task', { taskId, url: 'https://github.com/y', note: 'v2' })).status, 200)
    assert.equal((await run(admin, 'approve_task', { taskId, grade: 6, feedback: '' })).error?.code, 'invalid')
    const req = randomUUID()
    assert.equal((await run(admin, 'approve_task', { taskId, grade: 4, feedback: 'nice' }, req)).status, 200)
    assert.equal((await run(admin, 'approve_task', { taskId, grade: 4, feedback: 'nice' }, req)).status, 200, 'same requestId replays')
    const { rows } = await owner.query(`select count(*)::int as n from app.task_reviews where task_id = $1 and verdict = 'approved'`, [taskId])
    assert.equal(rows[0].n, 1, 'replayed approve wrote one review')
    assert.equal((await run(admin, 'pay_task', { taskId })).result.status, 'paid')
    assert.equal((await task(f1)).rejections, 1)
  })

  test('the change cursor never skips a row committed after a poll started', async () => {
    const cursor0 = (await call(f1, { since: 0 })).cursor
    await owner.query('begin')
    await owner.query(`update app.jobs set title = 'Site v2' where id = $1`, [jobId])
    const during = await call(f1, { since: cursor0 })
    assert.deepEqual(during.jobs, [], 'uncommitted write is invisible')
    await owner.query('commit')
    const afterCommit = await call(f1, { since: during.cursor })
    assert.equal(afterCommit.jobs[0]?.title, 'Site v2')
    assert.deepEqual((await call(f1, { since: afterCommit.cursor })).jobs, [], 'nothing new → empty delta')
  })

  test('unknown commands are refused', async () => {
    assert.equal((await run(f1, 'drop_everything', {})).error?.code, 'unknown_command')
    assert.equal((await run(f1, 'claim_task; drop table app.tasks', {})).error?.code, 'unknown_command')
  })

  test('5: removing a member signs them out, blocks re-entry, and reopens their in-flight work', async () => {
    const t2 = (await run(admin, 'create_task', { jobId, title: 'Copy', description: '', payout: 100, freelancerDeadline: '2026-12-01' })).result.id
    assert.equal((await run(f2, 'claim_task', { taskId: t2 })).status, 200)
    assert.equal((await run(f2, 'submit_task', { taskId: t2, url: 'https://x.dev', note: '' })).status, 200)
    assert.equal((await run(admin, 'reject_task', { taskId: t2, feedback: 'for f2 only' })).status, 200)
    assert.equal((await run(admin, 'revoke_invite', { email: 'f2@x.com' })).error?.code, 'wrong_state', 'joined → remove, not revoke')
    assert.equal((await run(admin, 'remove_member', { uid: 'F2' })).status, 200)
    assert.equal((await call(f2, { since: 0 })).status, 401)
    assert.equal((await signIn({ sub: 'F2', email: 'f2@x.com', email_verified: true })).error?.code, 'removed')
    assert.equal((await task(admin, t2)).status, 'open')
    assert.equal((await run(f1, 'claim_task', { taskId: t2 })).status, 200)
    const reclaimed = await task(f1, t2)
    assert.equal(reclaimed.review, null, "the new assignee doesn't inherit the removed member's review")
    assert.equal(reclaimed.rejections, 0)
    assert.equal((await run(admin, 'remove_member', { uid: 'A' })).error?.code, 'not_allowed', 'admins cannot be removed')
  })

  test('the gateway role reaches nothing but gate.*', async () => {
    await assert.rejects(gw.query('select count(*) from app.tasks'), /permission denied/)
    await assert.rejects(gw.query(`select cmd.pay_task(null, '{}')`), /permission denied/)
    await assert.rejects(gw.query('select lib.changes(null, 0)'), /permission denied/)
  })
})
