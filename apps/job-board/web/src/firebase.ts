import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut, type User } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import type { Job, Member, Review, Task } from './domain'

const app = initializeApp({
  apiKey: 'AIzaSyAEk7qx1iGAyEY9-fw-cOxQfmkJCkI7tsA',
  authDomain: location.hostname === 'localhost' ? 'job-board-pilot-pw.firebaseapp.com' : location.host,
  projectId: 'job-board-pilot-pw',
  storageBucket: 'job-board-pilot-pw.firebasestorage.app',
  messagingSenderId: '929476411060',
  appId: '1:929476411060:web:b485c0440aabaf1cfc21e1',
})

export const auth = getAuth(app)
const db = getFirestore(app)

export const ADMIN_EMAILS = ['pongwasin@gmail.com']

export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider())
export const logOut = () => signOut(auth)

export class NotInvitedError extends Error {}

export async function enroll(user: User): Promise<Member> {
  const ref = doc(db, 'users', user.uid)
  const existing = await getDoc(ref)
  if (existing.exists()) return { uid: user.uid, ...existing.data() } as Member

  const email = user.email!.toLowerCase()
  const isAdmin = ADMIN_EMAILS.includes(email)
  if (!isAdmin) {
    const invite = await getDoc(doc(db, 'invites', email)).catch(() => null)
    if (!invite?.exists()) throw new NotInvitedError(email)
  }
  const member: Omit<Member, 'uid'> = {
    email,
    name: user.displayName ?? email,
    photo: user.photoURL ?? '',
    role: isAdmin ? 'admin' : 'freelancer',
  }
  await setDoc(ref, { ...member, joinedAt: serverTimestamp() })
  return { uid: user.uid, ...member }
}

function watch<T>(name: string, order: string, cb: (rows: T[]) => void) {
  return onSnapshot(query(collection(db, name), orderBy(order, 'desc')), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, uid: d.id, ...d.data() }) as T)),
  )
}

export const watchJobs = (cb: (rows: Job[]) => void) => watch<Job>('jobs', 'createdAt', cb)
export const watchTasks = (cb: (rows: Task[]) => void) =>
  watch<Task & { submittedAt: Timestamp | null }>('tasks', 'freelancerDeadline', (rows) =>
    cb(rows.map((t) => ({ ...t, submittedAt: t.submittedAt?.toMillis() ?? null }))),
  )
export const watchMembers = (cb: (rows: Member[]) => void) => watch<Member>('users', 'email', cb)
export const watchInvites = (cb: (rows: { id: string }[]) => void) => watch<{ id: string }>('invites', 'createdAt', cb)

export const createJob = (job: Omit<Job, 'id' | 'createdAt'>) => addDoc(collection(db, 'jobs'), { ...job, createdAt: Date.now() })

export const createTask = (job: Job, t: Pick<Task, 'title' | 'description' | 'payout' | 'freelancerDeadline'>) =>
  addDoc(collection(db, 'tasks'), {
    ...t,
    jobId: job.id,
    jobTitle: job.title,
    status: 'open',
    assigneeUid: null,
    assigneeName: null,
    submissionUrl: null,
    submissionNote: null,
    submittedAt: null,
    review: null,
    rejections: 0,
  } satisfies Omit<Task, 'id'>)

export const invite = (email: string) =>
  setDoc(doc(db, 'invites', email.trim().toLowerCase()), { createdAt: Date.now() })
export const revokeInvite = (email: string) => deleteDoc(doc(db, 'invites', email))

const task = (id: string) => doc(db, 'tasks', id)

export const claimTask = (id: string, me: Member) =>
  updateDoc(task(id), { status: 'assigned', assigneeUid: me.uid, assigneeName: me.name })

export const submitTask = (id: string, url: string, note: string) =>
  updateDoc(task(id), { status: 'submitted', submissionUrl: url, submissionNote: note, submittedAt: serverTimestamp() })

export const approveTask = (id: string, grade: number, feedback: string) =>
  updateDoc(task(id), { status: 'approved', review: { grade, feedback, at: Date.now() } satisfies Review })

export const rejectTask = (id: string, feedback: string) =>
  updateDoc(task(id), { status: 'assigned', rejections: increment(1), review: { grade: 0, feedback, at: Date.now() } })

export const payTask = (id: string) => updateDoc(task(id), { status: 'paid', paidAt: Date.now() })
