import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BoardState, type FileRow, type MemberRow, type TaskRow, type Wire } from './board.ts'

const me: MemberRow = { uid: 'F1', email: 'f1@x.com', name: 'Free One', photoId: null, role: 'freelancer', removed: false, version: 1 }
const other: MemberRow = { uid: 'F2', email: null, name: 'Free Two', photoId: null, role: 'freelancer', removed: false, version: 2 }
const job = { id: 'j1', title: 'Site', customer: 'Acme', description: '', customerDeadline: '2026-12-31', createdAt: 1, files: [], version: 3 }
const task = (version: number, patch: Partial<TaskRow> = {}): TaskRow => ({
  id: 't1', jobId: 'j1', title: 'Form', description: '', payout: 100, freelancerDeadline: '2026-12-01',
  status: 'open', assigneeUid: null, submissionUrl: null, submissionNote: null, submittedAt: null,
  review: null, files: [], rejections: 0, actions: ['claim'], version, ...patch,
})
const wire = (cursor: number, patch: Partial<Wire> = {}): Wire => ({
  status: 200, cursor, me, jobs: [], tasks: [], members: [], invites: [], error: null, ...patch,
})

test('a newer version replaces an older one; an older one never overwrites', () => {
  const s = new BoardState()
  s.apply(wire(5, { tasks: [task(5, { status: 'assigned', assigneeUid: 'F2' })], members: [me, other], jobs: [job] }))
  s.apply(wire(4, { tasks: [task(4)] })) // a slow, earlier response arriving late
  assert.equal(s.view().tasks[0].status, 'assigned')
  assert.equal(s.cursor, 5, 'cursor never moves backwards')
})

test('applying the same delta twice changes nothing', () => {
  const s = new BoardState()
  const w = wire(5, { tasks: [task(5)], members: [me], jobs: [job] })
  s.apply(w)
  const once = JSON.stringify(s.view())
  s.apply(w)
  assert.equal(JSON.stringify(s.view()), once)
})

test('jobTitle and assigneeName are joined from the latest rows', () => {
  const s = new BoardState()
  s.apply(wire(5, { tasks: [task(5, { status: 'assigned', assigneeUid: 'F2' })], members: [me, other], jobs: [job] }))
  s.apply(wire(6, { members: [{ ...other, name: 'Renamed', version: 6 }], jobs: [{ ...job, title: 'Site v2', version: 6 }] }))
  const [t] = s.view().tasks
  assert.equal(t.jobTitle, 'Site v2')
  assert.equal(t.assigneeName, 'Renamed')
})

test('removed members and revoked invites drop out; invites learn who joined', () => {
  const s = new BoardState()
  s.apply(wire(5, {
    members: [{ ...me, role: 'admin' }, { ...other, email: 'f2@x.com' }],
    invites: [
      { email: 'f2@x.com', createdAt: 2, revoked: false, version: 4 },
      { email: 'f3@x.com', createdAt: 3, revoked: false, version: 5 },
    ],
  }))
  assert.deepEqual(s.view().invites.map((i) => [i.email, i.joined, i.uid]), [['f3@x.com', false, null], ['f2@x.com', true, 'F2']])
  s.apply(wire(7, { members: [{ ...other, email: 'f2@x.com', removed: true, version: 6 }], invites: [{ email: 'f2@x.com', createdAt: 2, revoked: true, version: 7 }] }))
  assert.deepEqual(s.view().members.map((m) => m.uid), ['F1'])
  assert.deepEqual(s.view().invites.map((i) => i.email), ['f3@x.com'])
})

test('hidden review feedback is absent, not null, so TaskCard gets an optional string', () => {
  const s = new BoardState()
  s.apply(wire(5, { tasks: [task(5, { status: 'changes', assigneeUid: 'F2', review: { verdict: 'changes', grade: 0, feedback: null, at: 9 } })], members: [me, other] }))
  assert.equal('feedback' in s.view().tasks[0].review!, false)
})

test('a fresh me row from any response wins over an older one', () => {
  const s = new BoardState()
  s.apply(wire(5, { me: { ...me, name: 'New', version: 9 } }))
  s.apply(wire(6, { me }))
  assert.equal(s.view().me.name, 'New')
})

const photo: FileRow = { id: 'p1', kind: 'submission', name: 'shot.jpg', mime: 'image/jpeg', bytes: 900, width: 2560, height: 1440, thumb: true }
const zip: FileRow = { id: 'z1', kind: 'submission', name: 'site.zip', mime: 'application/zip', bytes: 5000, width: null, height: null, thumb: false }

test('photoId becomes a same-origin avatar URL, and no photo becomes an empty string', () => {
  const s = new BoardState()
  s.apply(wire(5, { me: { ...me, photoId: 'a1' }, members: [{ ...me, photoId: 'a1' }, other] }))
  const v = s.view()
  assert.equal(v.me.photo, '/api/files/a1?v=file')
  assert.deepEqual(v.members.map((m) => m.photo), ['/api/files/a1?v=file', ''])
  assert.equal('photoId' in v.me, false)
})

test('task and job files become Attachments; only files with a thumbnail get thumbSrc', () => {
  const s = new BoardState()
  s.apply(wire(5, { tasks: [task(5, { files: [photo, zip] })], jobs: [{ ...job, files: [{ ...photo, id: 'b1', kind: 'brief', name: 'brief.png', mime: 'image/png' }] }], members: [me] }))
  const v = s.view()
  assert.deepEqual(v.tasks[0].files, [
    { id: 'p1', kind: 'submission', name: 'shot.jpg', mime: 'image/jpeg', bytes: 900, width: 2560, height: 1440, src: '/api/files/p1', thumbSrc: '/api/files/p1?v=thumb' },
    { id: 'z1', kind: 'submission', name: 'site.zip', mime: 'application/zip', bytes: 5000, width: null, height: null, src: '/api/files/z1', thumbSrc: null },
  ])
  assert.deepEqual(v.jobs[0].files.map((f) => [f.name, f.src, f.thumbSrc]), [['brief.png', '/api/files/b1', '/api/files/b1?v=thumb']])
})

test('a detached file disappears with the parent row\'s next version', () => {
  const s = new BoardState()
  s.apply(wire(5, { tasks: [task(5, { files: [photo, zip] })], members: [me], jobs: [job] }))
  s.apply(wire(6, { tasks: [task(6, { files: [zip] })] }))
  assert.deepEqual(s.view().tasks[0].files.map((f) => f.id), ['z1'])
})
