// The gateway: a deliberately dumb transport. It knows two things:
//   1. how to prove who is calling (Google OIDC code flow → verified claims → gate.sign_in), and
//   2. how to move a request body to gate.call and the result back.
// It knows no command names, roles, states or tables. Postgres answers every "may they?"
// (apps/job-board/db/api.sql), and the bt_gateway role can execute gate.* and nothing else.
//
// Routes. Everything else is a static asset, served by Cloudflare without running this Worker.
//   GET  /api/auth/google    → 302 to Google (state + PKCE verifier in a short-lived cookie)
//   GET  /api/auth/callback  → exchange the code, gate.sign_in, set the session cookie, 302 to /
//   POST /api/auth/logout    → gate.sign_out, clear the cookie
//   POST /api                → gate.call(session, body): polls and commands alike
//
// To move to Cloud Run, run `handle()` under a Node server and swap neon() for pg. Nothing else changes.
import { neon, neonConfig } from '@neondatabase/serverless'

export interface Env {
  /** bt_gateway role, Neon pooled host. Worker secret. */
  DATABASE_URL: string
  GOOGLE_CLIENT_ID: string
  /** Worker secret. */
  GOOGLE_CLIENT_SECRET: string
  /** https://crew.boromtech.co in production, http://localhost:5173 in dev. The only Origin accepted on POST. */
  PUBLIC_ORIGIN: string
  /** Dev only: http://localhost:4444/sql to reach docker Postgres through local-neon-http-proxy. */
  NEON_FETCH_ENDPOINT?: string
}

/** The envelope every gate.* function returns. The transport reads `status` (and `token` at sign-in) only. */
type GateResult = { status: number; token?: string; error?: { code: string } | null }

const MAX_BODY = 32 * 1024
const SESSION_MAX_AGE = 30 * 86_400
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
} satisfies ExportedHandler<Env>

export async function handle(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url)
  if (req.method === 'POST' && pathname === '/api') return rpc(req, env)
  if (req.method === 'GET' && pathname === '/api/auth/google') return startLogin(env)
  if (req.method === 'GET' && pathname === '/api/auth/callback') return finishLogin(req, env)
  if (req.method === 'POST' && pathname === '/api/auth/logout') return logout(req, env)
  return new Response('Not found', { status: 404 })
}

/** One SQL round trip over HTTPS. `fn` is a literal union, never user input. */
async function gate(env: Env, fn: 'call' | 'sign_in' | 'sign_out', ...params: unknown[]): Promise<GateResult> {
  if (env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = env.NEON_FETCH_ENDPOINT
  const sql = neon(env.DATABASE_URL)
  const casts = { call: '$1, $2::jsonb', sign_in: '$1::jsonb', sign_out: '$1' }[fn]
  const rows = await sql.query(`select gate.${fn}(${casts}) as r`, params)
  return rows[0].r as GateResult
}

async function rpc(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('origin') !== env.PUBLIC_ORIGIN) return text(403, 'Bad origin')
  if (!req.headers.get('content-type')?.startsWith('application/json')) return text(415, 'JSON only')
  const body = await req.text()
  if (body.length > MAX_BODY) return text(413, 'Too large')
  try {
    JSON.parse(body)
  } catch {
    return text(400, 'Bad JSON')
  }
  // The body goes to Postgres as text and is cast there; its shape is Postgres's business.
  const r = await gate(env, 'call', readCookie(req, sessionCookie(env)) ?? '', body)
  return Response.json(r, { status: r.status, headers: { 'cache-control': 'no-store' } })
}

async function startLogin(env: Env): Promise<Response> {
  const state = hex(crypto.getRandomValues(new Uint8Array(16)))
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return redirect(url.toString(), setCookie(env, oauthCookie(env), `${state}.${verifier}`, { maxAge: 600, sameSite: 'Lax' }))
}

async function finishLogin(req: Request, env: Env): Promise<Response> {
  const fail = (code: string) => redirect(`/?auth_error=${code}`, clearCookie(env, oauthCookie(env)))
  const params = new URL(req.url).searchParams
  const [state, verifier] = (readCookie(req, oauthCookie(env)) ?? '').split('.')
  const code = params.get('code')
  if (!state || !verifier || !code || params.get('state') !== state) return fail('sign_in_failed')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(env),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  if (!tokenRes.ok) return fail('sign_in_failed')
  const { id_token } = (await tokenRes.json()) as { id_token?: string }
  const claims = id_token ? decodeJwtPayload(id_token) : null
  // The id_token came straight from Google's token endpoint over TLS, authenticated by our client secret,
  // so OIDC Core §3.1.3.7 lets us skip the signature check. The claims still have to be for us and current.
  if (!claims || !GOOGLE_ISSUERS.includes(claims.iss) || claims.aud !== env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now()) {
    return fail('sign_in_failed')
  }

  const r = await gate(env, 'sign_in', JSON.stringify({
    sub: claims.sub,
    email: claims.email,
    email_verified: claims.email_verified === true,
    name: claims.name,
    picture: claims.picture,
  }))
  if (r.status !== 200 || !r.token) return fail(r.error?.code ?? 'sign_in_failed')
  return redirect('/', clearCookie(env, oauthCookie(env)), setCookie(env, sessionCookie(env), r.token, { maxAge: SESSION_MAX_AGE, sameSite: 'Strict' }))
}

async function logout(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('origin') !== env.PUBLIC_ORIGIN) return text(403, 'Bad origin')
  const token = readCookie(req, sessionCookie(env))
  if (token) await gate(env, 'sign_out', token)
  return new Response(null, { status: 204, headers: { 'set-cookie': clearCookie(env, sessionCookie(env)) } })
}

// ---- helpers ------------------------------------------------------------------------------------

interface GoogleClaims {
  iss: string
  aud: string
  exp: number
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string
}

function decodeJwtPayload(jwt: string): GoogleClaims | null {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as GoogleClaims
  } catch {
    return null
  }
}

const secure = (env: Env) => env.PUBLIC_ORIGIN.startsWith('https://')
// __Host- pins the cookie to this origin (Secure, Path=/, no Domain). Plain http://localhost can't use it.
const sessionCookie = (env: Env) => (secure(env) ? '__Host-bt_session' : 'bt_session')
const oauthCookie = (env: Env) => (secure(env) ? '__Host-bt_oauth' : 'bt_oauth')
const redirectUri = (env: Env) => `${env.PUBLIC_ORIGIN}/api/auth/callback`

function setCookie(env: Env, name: string, value: string, o: { maxAge: number; sameSite: 'Lax' | 'Strict' }): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${o.sameSite}; Max-Age=${o.maxAge}${secure(env) ? '; Secure' : ''}`
}

function clearCookie(env: Env, name: string): string {
  return setCookie(env, name, '', { maxAge: 0, sameSite: 'Lax' })
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

function redirect(location: string, ...cookies: string[]): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status: 302, headers })
}

function text(status: number, body: string): Response {
  return new Response(body, { status })
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
