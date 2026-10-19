// Attachments: who may upload, what counts as verified, who sees what, and what the sweep may delete.
// Same harness as contract.test.ts. No R2 needed: Postgres only hands out signing specs and judges the facts
// the transport reports, so the tests assert on specs and states.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import type pg from 'pg'
import { UPLOAD_RULES } from '@boromtech/domain'
import { freshDb, gate, type Db } from './harness.ts'

let db: Db
let g: ReturnType<typeof gate>
let admin: string
let f1: string
let f2: string
let jobId: string
let taskId: string

const jpeg = (bytes: number, clean = true) => ({ bytes, type: 'image/jpeg', clean })

/** Declare, "PUT", and verify an upload as `token`. Returns the file id. */
async function uploaded(token: string, kind: 'submission' | 'brief', o: { mime?: string; bytes?: number; thumb?: boolean } = {}) {
  const id = randomUUID()
  const mime = o.mime ?? 'image/jpeg'
  const bytes = o.bytes ?? 1000
  const r = await g.upload(token, { id, kind, name: 'shot.jpg', mime, bytes, ...(o.thumb && { thumbBytes: 100 }) })
  assert.equal(r.status, 200, JSON.stringify(r.error))
  const done = await g.uploadDone(token, {
    id,
    file: { bytes, type: mime, clean: true },
    ...(o.thumb && { thumb: jpeg(100) }),
  })
  assert.equal(done.status, 200, JSON.stringify(done.error))
  return id
}

const taskView = async (token: string, id = taskId) => (await g.call(token, { since: 0 })).tasks.find((t: { id: string }) => t.id === id)

before(async () => {
  db = await freshDb('bt_files')
  g = gate(await db.connect('bt_gateway'))
  admin = (await g.signIn({ sub: 'A', email: 'pongwasin@gmail.com', email_verified: true, name: 'Pong' })).token
  await g.run(admin, 'invite', { email: 'f1@x.com' })
  await g.run(admin, 'invite', { email: 'f2@x.com' })
  f1 = (await g.signIn({ sub: 'F1', email: 'f1@x.com', email_verified: true, name: 'Free One' })).token
  f2 = (await g.signIn({ sub: 'F2', email: 'f2@x.com', email_verified: true, name: 'Free Two' })).token
  jobId = (await g.run(admin, 'create_job', { title: 'Site', customer: 'Acme', description: '', customerDeadline: '2026-12-31' })).result.id
  taskId = (await g.run(admin, 'create_task', { jobId, title: 'Form', description: '', payout: 100, freelancerDeadline: '2026-12-01' })).result.id
  assert.equal((await g.run(f1, 'claim_task', { taskId })).status, 200)
})
after(() => db?.close())

describe('TS ↔ SQL contract (files)', () => {
  test('UPLOAD_RULES == lib.file_rules() for browser-uploadable kinds', async () => {
    const { rows } = await db.owner.query(`select kind::text, mimes, max_bytes from lib.file_rules() where uploader <> 'transport' order by 1`)
    const sql = Object.fromEntries(rows.map((r) => [r.kind, { mimes: r.mimes, maxBytes: r.max_bytes }]))
    assert.deepEqual(sql, JSON.parse(JSON.stringify(UPLOAD_RULES)))
  })
})

describe('upload', () => {
  test('freelancers upload submissions, admins upload briefs, not the other way round', async () => {
    const as = (token: string, kind: string) => g.upload(token, { id: randomUUID(), kind, name: 'a.jpg', mime: 'image/jpeg', bytes: 10 })
    assert.equal((await as(f1, 'submission')).status, 200)
    assert.equal((await as(f1, 'brief')).error?.code, 'not_allowed')
    assert.equal((await as(admin, 'brief')).status, 200)
    assert.equal((await as(admin, 'submission')).error?.code, 'not_allowed')
    assert.equal((await as(f1, 'avatar')).error?.code, 'invalid', 'only the transport writes avatars')
  })

  test('mime outside the allowlist, bytes over the max, a thumbnail on a PDF → invalid', async () => {
    const up = (body: object) => g.upload(f1, { id: randomUUID(), kind: 'submission', name: 'x', ...body })
    assert.equal((await up({ mime: 'image/svg+xml', bytes: 10 })).error?.code, 'invalid')
    assert.equal((await up({ mime: 'image/jpeg', bytes: 16 * 1048576 })).error?.code, 'invalid')
    assert.equal((await up({ mime: 'application/pdf', bytes: 10, thumbBytes: 5 })).error?.code, 'invalid')
  })

  test('the PUT spec signs the exact type and length; the same id twice gets the same keys', async () => {
    const id = randomUUID()
    const body = { id, kind: 'submission', name: 'a.jpg', mime: 'image/jpeg', bytes: 1234, thumbBytes: 99 }
    const r = await g.upload(f1, body)
    assert.deepEqual(r.presign.file, { method: 'PUT', key: `f/${id}`, ttl: 600, contentType: 'image/jpeg', contentLength: 1234, cacheControl: 'private, max-age=31536000, immutable' })
    assert.equal(r.presign.thumb.key, `t/${id}`)
    assert.deepEqual((await g.upload(f1, body)).presign, r.presign)
    assert.equal((await g.upload(f1, { ...body, bytes: 1 })).error?.code, 'invalid', 'same id, different file')
    assert.equal((await g.upload(f2, body)).error?.code, 'invalid', "another member can't reuse the id")
  })

  test('51 uploads in a day → too_many (429)', async () => {
    const quotaUser = (await g.run(admin, 'invite', { email: 'q@x.com' }), (await g.signIn({ sub: 'Q', email: 'q@x.com', email_verified: true })).token)
    for (let i = 0; i < 50; i++) {
      assert.equal((await g.upload(quotaUser, { id: randomUUID(), kind: 'submission', name: 'a', mime: 'image/jpeg', bytes: 10 })).status, 200)
    }
    const r = await g.upload(quotaUser, { id: randomUUID(), kind: 'submission', name: 'a', mime: 'image/jpeg', bytes: 10 })
    assert.equal(r.status, 429)
    assert.equal(r.error?.code, 'too_many')
  })
})

describe('verification (gate.upload_done)', () => {
  const declare = async (o: { mime?: string; thumb?: boolean } = {}) => {
    const id = randomUUID()
    await g.upload(f1, { id, kind: 'submission', name: 'a', mime: o.mime ?? 'image/jpeg', bytes: 500, ...(o.thumb && { thumbBytes: 50 }) })
    return id
  }

  test('a missing object is "not finished yet", and the file stays retryable', async () => {
    const id = await declare()
    assert.equal((await g.uploadDone(f1, { id, file: { bytes: 0, type: 'unknown', clean: true } })).error?.code, 'wrong_state')
    assert.equal((await g.uploadDone(f1, { id, file: jpeg(500) })).file.state, 'ready')
    assert.equal((await g.uploadDone(f1, { id, file: jpeg(500) })).file.state, 'ready', 'idempotent')
  })

  test('wrong size, wrong type, or metadata left in → failed for good, with the reason', async () => {
    for (const [file, why] of [
      [jpeg(501), /size/],
      [{ bytes: 500, type: 'image/png', clean: true }, /not image\/jpeg/],
      [jpeg(500, false), /metadata/],
    ] as const) {
      const id = await declare()
      const r = await g.uploadDone(f1, { id, file })
      assert.equal(r.error?.code, 'invalid')
      assert.match(r.error!.message, why)
      assert.equal((await g.uploadDone(f1, { id, file: jpeg(500) })).error?.code, 'invalid', 'stays failed')
    }
  })

  test('the thumbnail is checked too; PDFs are not inspected for metadata', async () => {
    const id = await declare({ thumb: true })
    assert.equal((await g.uploadDone(f1, { id, file: jpeg(500), thumb: jpeg(50, false) })).error?.code, 'invalid')
    const pdf = await declare({ mime: 'application/pdf' })
    assert.equal((await g.uploadDone(f1, { id: pdf, file: { bytes: 500, type: 'application/pdf', clean: false } })).file.state, 'ready')
  })

  test("only the uploader can report on a file", async () => {
    const id = await declare()
    assert.equal((await g.uploadDone(f2, { id, file: jpeg(500) })).error?.code, 'not_found')
  })

  test('an unverified upload cannot be attached', async () => {
    const id = await declare()
    const r = await g.run(f1, 'submit_task', { taskId, url: '', note: '', fileIds: [id] })
    assert.equal(r.error?.code, 'wrong_state')
  })
})

describe('submissions and visibility', () => {
  let shot: string

  test('a link or at least one file is required; files must be your own verified submissions', async () => {
    assert.equal((await g.run(f1, 'submit_task', { taskId, url: '', note: '' })).error?.code, 'invalid')
    const brief = await uploaded(admin, 'brief')
    assert.equal((await g.run(f1, 'submit_task', { taskId, url: '', note: '', fileIds: [brief] })).error?.code, 'not_found')
    const others = await uploaded(f2, 'submission')
    assert.equal((await g.run(f1, 'submit_task', { taskId, url: '', note: '', fileIds: [others] })).error?.code, 'not_found')
  })

  test('submitting with files attaches them; admin and assignee see them, other freelancers do not', async () => {
    shot = await uploaded(f1, 'submission', { thumb: true })
    const before = await taskView(admin)
    assert.equal((await g.run(f1, 'submit_task', { taskId, url: '', note: 'see photo', fileIds: [shot] })).status, 200)
    const forAdmin = await taskView(admin)
    assert.ok(forAdmin.version > before.version, 'the task row is re-sent to pollers')
    assert.deepEqual(forAdmin.files.map((f: { id: string; thumb: boolean }) => [f.id, f.thumb]), [[shot, true]])
    assert.equal((await taskView(f1)).files.length, 1)
    assert.equal((await taskView(f2)).files.length, 0)
    assert.equal((await g.file(f2, shot, 'file')).status, 404)
    const view = await g.file(admin, shot, 'thumb')
    assert.equal(view.presign.get.key, `t/${shot}`)
    assert.equal(view.presign.get.ttl, 7200)
  })

  test('briefs on a job or task are listed for and openable by every member', async () => {
    const brief = await uploaded(admin, 'brief')
    assert.equal((await g.run(admin, 'attach_files', { jobId, fileIds: [brief] })).status, 200)
    const job = (await g.call(f2, { since: 0 })).jobs.find((j: { id: string }) => j.id === jobId)
    assert.deepEqual(job.files.map((f: { id: string }) => f.id), [brief])
    assert.equal((await g.file(f2, brief, 'file')).status, 200)
    assert.equal((await g.file(f2, brief, 'thumb')).status, 404, 'no thumbnail was declared')
    assert.equal((await g.run(f1, 'attach_files', { jobId, fileIds: [brief] })).error?.code, 'not_allowed')
  })

  test('an unattached upload is not viewable, even by its uploader', async () => {
    const draft = await uploaded(f1, 'submission')
    assert.equal((await g.file(f1, draft, 'file')).status, 404)
  })

  test('Thai file names are percent-encoded for Content-Disposition', async () => {
    const id = randomUUID()
    await g.upload(admin, { id, kind: 'brief', name: 'แบบร่าง.pdf', mime: 'application/pdf', bytes: 10 })
    await g.uploadDone(admin, { id, file: { bytes: 10, type: 'application/pdf', clean: true } })
    await g.run(admin, 'attach_files', { taskId, fileIds: [id] })
    const spec = (await g.file(f1, id, 'file')).presign.get
    assert.match(spec.disposition, /^attachment; filename\*=UTF-8''%E0%B9%81/)
  })

  test('detach: the assignee only while the task is back with them; admins always', async () => {
    assert.equal((await g.run(f1, 'detach_file', { fileId: shot })).error?.code, 'not_allowed', 'submitted: locked')
    assert.equal((await g.run(admin, 'reject_task', { taskId, feedback: 'blurry' })).status, 200)
    assert.equal((await g.run(f1, 'detach_file', { fileId: shot })).status, 200)
    assert.deepEqual((await taskView(f1)).files.filter((f: { kind: string }) => f.kind === 'submission'), [])
    assert.equal((await g.run(f1, 'detach_file', { fileId: shot })).status, 200, 'detaching twice is a no-op')
  })
})

describe('members', () => {
  test('removing a member detaches their in-flight files; delivered work keeps its files', async () => {
    const t2 = (await g.run(admin, 'create_task', { jobId, title: 'Copy', description: '', payout: 5, freelancerDeadline: '2026-12-01' })).result.id
    const t3 = (await g.run(admin, 'create_task', { jobId, title: 'Logo', description: '', payout: 5, freelancerDeadline: '2026-12-01' })).result.id
    await g.run(f2, 'claim_task', { taskId: t2 })
    await g.run(f2, 'claim_task', { taskId: t3 })
    const inFlight = await uploaded(f2, 'submission')
    const delivered = await uploaded(f2, 'submission')
    await g.run(f2, 'submit_task', { taskId: t2, url: '', note: '', fileIds: [inFlight] })
    await g.run(admin, 'reject_task', { taskId: t2, feedback: 'again' })
    await g.run(f2, 'submit_task', { taskId: t3, url: '', note: '', fileIds: [delivered] })
    await g.run(admin, 'approve_task', { taskId: t3, grade: 5, feedback: '' })
    assert.equal((await g.run(admin, 'remove_member', { uid: 'F2' })).status, 200)
    const state = async (id: string) => (await db.owner.query('select state from app.files where id = $1', [id])).rows[0].state
    assert.equal(await state(inFlight), 'detached')
    assert.equal(await state(delivered), 'attached')
    assert.equal((await g.file(admin, delivered, 'file')).status, 200)
  })

  test('sign-in copies the Google photo once per picture; a new picture replaces it', async () => {
    const pic = 'https://lh3.googleusercontent.com/a/one=s96-c'
    const first = await g.signIn({ sub: 'F1', email: 'f1@x.com', email_verified: true, picture: pic })
    assert.equal(first.presign.avatar.method, 'PUT')
    const id = first.presign.avatar.key.slice(2)
    assert.equal(first.me.photoId, id)
    const again = await g.signIn({ sub: 'F1', email: 'f1@x.com', email_verified: true, picture: pic })
    assert.equal(again.me.photoId, id, 'same picture, same file')
    const changed = await g.signIn({ sub: 'F1', email: 'f1@x.com', email_verified: true, picture: 'https://lh3.googleusercontent.com/a/two' })
    assert.notEqual(changed.me.photoId, id)
    const { rows } = await db.owner.query(`select state::text from app.files where kind = 'avatar' and member_uid = 'F1' order by created_at`)
    assert.deepEqual(rows.map((r) => r.state), ['detached', 'attached'])
    const seen = (await g.call(admin, { since: 0 })).members.find((m: { uid: string }) => m.uid === 'F1')
    assert.equal(seen.photoId, changed.me.photoId, "everyone sees a member's photo")
  })

  test('a picture from anywhere but googleusercontent.com is not copied', async () => {
    const r = await g.signIn({ sub: 'A', email: 'pongwasin@gmail.com', email_verified: true, picture: 'https://evil.example/x.jpg' })
    assert.equal(r.presign, undefined)
  })
})

describe('sweep', () => {
  let sweeper: pg.Client
  before(async () => {
    sweeper = await db.connect('bt_sweeper')
  })
  const sweep = async (purged: string[]) => (await sweeper.query('select gate.sweep($1::uuid[]) as r', [purged])).rows[0].r

  test('only files never attached or detached 30+ days ago; attached evidence is never offered', async () => {
    await db.owner.query(`update app.files set created_at = now() - interval '31 days', detached_at = case when state = 'detached' then now() - interval '31 days' end`)
    const offered = Object.keys((await sweep([])).presign)
    const { rows } = await db.owner.query(`select id::text, state::text, thumb_bytes from app.files`)
    const attached = rows.filter((r) => r.state === 'attached').map((r) => r.id)
    assert.ok(offered.length > 0)
    for (const label of offered) assert.ok(!attached.includes(label.replace(/:t$/, '')), `offered attached file ${label}`)
    const ids = [...new Set(offered.map((l) => l.replace(/:t$/, '')))]
    const next = await sweep(ids)
    assert.ok(Object.keys(next.presign).every((l) => !ids.includes(l.replace(/:t$/, ''))), 'reported ids are not offered again')
    const purged = (await db.owner.query(`select count(*)::int as n from app.files where purged_at is not null`)).rows[0].n
    assert.equal(purged, ids.length)
  })

  test('bt_sweeper can run the sweep and nothing else; bt_gateway cannot run it', async () => {
    await assert.rejects(sweeper.query(`select gate.call('', '{}')`), /permission denied/)
    await assert.rejects(sweeper.query('select count(*) from app.files'), /permission denied/)
    const gw = await db.connect('bt_gateway')
    await assert.rejects(gw.query(`select gate.sweep('{}')`), /permission denied/)
  })
})
