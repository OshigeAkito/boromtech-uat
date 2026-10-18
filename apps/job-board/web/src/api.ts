// The job board's whole backend contract. Replaces firebase.ts. Five exports:
//
//   const board = useBoard()                  // loading | signedOut | member (+ all rows, kept fresh)
//   await run('claim_task', { taskId })       // typed by Commands in @boromtech/domain
//   signIn(), signOut(), ApiError
//
// Hidden here: the session cookie, the single /api endpoint, the change cursor, merging deltas, joining
// jobTitle / assigneeName, sorting, the poll schedule, request ids, and every wire shape.
//
// Freshness (replaces onSnapshot): every response, poll or command, carries the rows changed since our
// cursor. A command's own response updates the screen at once. Other people's changes arrive on the next
// poll: every 10 s while the tab is visible and the user did something in the last 5 minutes, and at once
// on focus or the first input after idle. An idle tab stops polling so Neon can scale to zero.
import { useSyncExternalStore } from 'react'
import type { CommandName, Commands, ErrorCode } from '@boromtech/domain'
import { BoardState, type MemberView, type Wire } from './board'

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
  network: 'Can’t reach the server. Check your connection and try again.',
}

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
    let res: Response
    try {
      res = await fetch('/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
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
    const w = (await res.json()) as Wire
    this.state.apply(w)
    this.phase = 'member'
    this.rebuild()
    return w
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
