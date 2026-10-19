// The job board's whole backend contract. Replaces firebase.ts. Six exports:
//
//   const board = useBoard()                  // loading | signedOut | member (+ all rows, kept fresh)
//   await run('claim_task', { taskId })       // typed by Commands in @boromtech/domain
//   const id = await upload(file, 'submission', (f) => …)   // then pass id in fileIds to a command
//   signIn(), signOut(), ApiError
//
// Hidden here: the session cookie, the single /api endpoint, the change cursor, merging deltas, joining
// jobTitle / assigneeName, sorting, the poll schedule, request ids, every wire shape, and for uploads the
// image preparation (prepare.ts), the upload intent, the signed R2 URLs and headers, and verification.
//
// Freshness (replaces onSnapshot): every response, poll or command, carries the rows changed since our
// cursor. A command's own response updates the screen at once. Other people's changes arrive on the next
// poll: every 10 s while the tab is visible and the user did something in the last 5 minutes, and at once
// on focus or the first input after idle. An idle tab stops polling so Neon can scale to zero.
import SparkMD5 from 'spark-md5'
import { useSyncExternalStore } from 'react'
import type { CommandName, Commands, ErrorCode, UploadKind } from '@boromtech/domain'
import { BoardState, type MemberView, type Wire } from './board'
import { prepare, PrepareError } from './prepare'

export type Board =
  | { state: 'loading' }
  /** `error` comes back from a refused sign-in (`/?auth_error=…`). */
  | { state: 'signedOut'; error?: SignInError }
  | (MemberView & {
      /** Last failed command, for a dismissable banner. Commands still reject. */
      error: ApiError | null
      dismissError(): void
    })

export type SignInError = Extract<ErrorCode, 'not_invited' | 'email_unverified' | 'removed'> | 'sign_in_failed'

export class ApiError extends Error {
  readonly code: ErrorCode | 'network'
  constructor(code: ErrorCode | 'network', message: string) {
    super(message)
    this.code = code
  }
}

/** Full-page redirect into the gateway's Google sign-in. */
export function signIn(): void {
  location.assign('/api/auth/google')
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
  location.assign('/')
}

/**
 * Run one command. Resolves after the board already shows its effect. Rejects with ApiError and also
 * sets `board.error`, so fire-and-forget callers still surface failures (the losing claimer sees why).
 */
export function run<N extends CommandName>(name: N, args: Commands[N]['args']): Promise<Commands[N]['result']> {
  return store.command(name, args) as Promise<Commands[N]['result']>
}

/**
 * Upload one file and resolve with its id once the server has verified the stored bytes. The file is not
 * visible to anyone until a command attaches it (`submit_task` fileIds, `attach_files`), which must happen
 * within a day. Images are re-encoded first: metadata stripped, long edge ≤ 2560 px, plus a thumbnail.
 * `onProgress` gets the main file's sent fraction, 0..1. Rejects with ApiError and sets `board.error`.
 */
export function upload(file: File, kind: UploadKind, onProgress?: (fraction: number) => void): Promise<string> {
  return store.upload(file, kind, onProgress)
}

export function useBoard(): Board {
  return useSyncExternalStore(store.subscribe, store.snapshot)
}

// =====================================================================================================
// Internals
// =====================================================================================================

const POLL_MS = 10_000
const IDLE_MS = 5 * 60_000

const MESSAGES: Partial<Record<ErrorCode | 'network', string>> = {
  claim_lost: 'Someone else claimed this task first.',
  wrong_state: 'This task has moved on. The board is up to date now.',
  not_allowed: 'You can’t do that.',
  not_signed_in: 'Your session ended. Sign in again.',
  too_many: 'You’ve reached today’s upload limit. Try again tomorrow.',
  network: 'Can’t reach the server. Check your connection and try again.',
}

/** Where an upload's wording differs from a command's. */
const UPLOAD_MESSAGES: Partial<Record<ErrorCode | 'network', string>> = {
  wrong_state: 'The upload didn’t finish. Try again.',
  not_allowed: 'You can’t upload files here.',
  network: 'The upload failed. Check your connection and try again.',
}

/** What /api/files answers: gate.upload with `presign` replaced by signed requests. */
interface Signed {
  method: string
  url: string
  headers: Record<string, string>
}
interface Envelope {
  status: number
  error?: { code: ErrorCode; message: string } | null
  signed?: { file: Signed; thumb?: Signed }
}

const DONE_RETRIES = 3

class Store {
  private state = new BoardState()
  private phase: 'loading' | 'signedOut' | 'member' = 'loading'
  private authError: SignInError | undefined
  private lastError: ApiError | null = null
  private cached: Board = { state: 'loading' }
  private listeners = new Set<() => void>()
  private lastInput = Date.now()
  private timer: ReturnType<typeof setInterval> | undefined

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    if (this.listeners.size === 1) this.start()
    return () => {
      this.listeners.delete(fn)
      if (this.listeners.size === 0) this.stop()
    }
  }

  /** Stable between changes, as useSyncExternalStore requires. */
  snapshot = (): Board => this.cached

  async command(name: CommandName, args: unknown): Promise<unknown> {
    const requestId = crypto.randomUUID()
    const body = { since: this.state.cursor, command: { name, args, requestId } }
    // One retry with the same requestId: Postgres replays the stored result instead of running it twice.
    const w = await this.post(body).catch(() => this.post(body))
    if (w.error) {
      this.lastError = new ApiError(w.error.code, MESSAGES[w.error.code] ?? w.error.message)
      this.rebuild()
      throw this.lastError
    }
    return w.result
  }

  private start(): void {
    const params = new URLSearchParams(location.search)
    const authError = params.get('auth_error')
    if (authError) {
      this.authError = authError as SignInError
      params.delete('auth_error')
      history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash)
    }
    addEventListener('focus', this.wake)
    addEventListener('pointerdown', this.wake)
    addEventListener('keydown', this.wake)
    document.addEventListener('visibilitychange', this.wake)
    this.timer = setInterval(this.tick, POLL_MS)
    void this.sync()
  }

  private stop(): void {
    removeEventListener('focus', this.wake)
    removeEventListener('pointerdown', this.wake)
    removeEventListener('keydown', this.wake)
    document.removeEventListener('visibilitychange', this.wake)
    clearInterval(this.timer)
  }

  private active = () => document.visibilityState === 'visible' && Date.now() - this.lastInput < IDLE_MS

  private tick = () => {
    if (this.phase !== 'signedOut' && this.active()) void this.sync()
  }

  /** Any input or refocus. Returning from idle or a hidden tab syncs at once. */
  private wake = () => {
    const wasActive = this.active()
    this.lastInput = Date.now()
    if (!wasActive && this.phase === 'member' && document.visibilityState === 'visible') void this.sync()
  }

  private async sync(): Promise<void> {
    await this.post({ since: this.state.cursor }).catch(() => undefined)
  }

  private async post(body: object): Promise<Wire> {
    const w = await this.request<Wire>('/api', body)
    this.state.apply(w)
    this.phase = 'member'
    this.rebuild()
    return w
  }

  /** POST JSON to the API. Commands, polls and uploads share it: a 401 from any of them means signed out. */
  private async request<T>(path: string, body: object): Promise<T> {
    let res: Response
    try {
      res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      throw new ApiError('network', MESSAGES.network!)
    }
    if (res.status === 401) {
      this.state = new BoardState()
      this.phase = 'signedOut'
      this.rebuild()
      throw new ApiError('not_signed_in', MESSAGES.not_signed_in!)
    }
    if (!res.headers.get('content-type')?.includes('application/json')) throw new ApiError('network', MESSAGES.network!)
    return (await res.json()) as T
  }

  async upload(file: File, kind: UploadKind, onProgress?: (fraction: number) => void): Promise<string> {
    const refused = (e: { code: ErrorCode; message: string }) =>
      new ApiError(e.code, e.code === 'invalid' ? `${file.name}: ${e.message}` : (UPLOAD_MESSAGES[e.code] ?? MESSAGES[e.code] ?? e.message))
    try {
      const p = await prepare(file, kind).catch((e: unknown) => {
        throw e instanceof PrepareError ? new ApiError('invalid', e.message) : e
      })
      // The id is ours, so a retried intent is the same file (gate.upload is idempotent on it).
      const id = crypto.randomUUID()
      // The MD5s are signed into the PUT URLs: storage refuses any other bytes, so what the server verifies
      // after the upload is what stays there.
      const intent = {
        id, kind, name: p.name, mime: p.mime, bytes: p.blob.size, md5: await md5(p.blob),
        ...(p.width && { width: p.width, height: p.height }),
        ...(p.thumb && { thumbBytes: p.thumb.size, thumbMd5: await md5(p.thumb) }),
      }
      const env = await this.request<Envelope>('/api/files', intent).catch(() => this.request<Envelope>('/api/files', intent))
      if (env.error || !env.signed) throw refused(env.error ?? { code: 'bad_request', message: 'No upload URL' })
      const { file: target, thumb } = env.signed
      // Same bytes to the same key, so one retry of a dropped PUT is harmless.
      await Promise.all([
        put(target, p.blob, onProgress).catch(() => put(target, p.blob, onProgress)),
        p.thumb && thumb && put(thumb, p.thumb).catch(() => put(thumb, p.thumb!)),
      ])
      // The server reads back what landed in R2. 'wrong_state' means it isn't visible yet: wait and ask again.
      for (let attempt = 0; ; attempt++) {
        const done = await this.request<Envelope>(`/api/files/${id}/done`, {})
        if (!done.error) break
        if (done.error.code !== 'wrong_state' || attempt === DONE_RETRIES) throw refused(done.error)
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
      }
      onProgress?.(1)
      return id
    } catch (e) {
      this.lastError = e instanceof ApiError && e.code !== 'network' ? e : new ApiError('network', UPLOAD_MESSAGES.network!)
      this.rebuild()
      throw this.lastError
    }
  }

  private rebuild(): void {
    if (this.phase === 'loading') this.cached = { state: 'loading' }
    else if (this.phase === 'signedOut') this.cached = { state: 'signedOut', error: this.authError }
    else this.cached = { ...this.state.view(), error: this.lastError, dismissError: this.dismissError }
    this.listeners.forEach((f) => f())
  }

  private dismissError = () => {
    this.lastError = null
    this.rebuild()
  }
}

const store = new Store()

/** PUT straight to R2 with exactly the signed headers. XHR, because fetch can't report upload progress. */
function put(target: Signed, body: Blob, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(target.method, target.url)
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value)
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    const fail = () => reject(new ApiError('network', UPLOAD_MESSAGES.network!))
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : fail())
    xhr.onerror = xhr.onabort = xhr.ontimeout = fail
    xhr.send(body)
  })
}

/** Base64 MD5 of a blob, the form S3's Content-MD5 header takes. */
async function md5(blob: Blob): Promise<string> {
  return btoa(SparkMD5.ArrayBuffer.hash(await blob.arrayBuffer(), true))
}
