// A fresh, migrated database per test file, and clients for each role, exactly as production connects.
// node --test runs files in parallel, so each file names its own database.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const OWNER_URL = process.env.OWNER_URL ?? 'postgres://postgres:owner@localhost:55432/postgres'

export type Envelope = Record<string, any> & { status: number; error?: { code: string; message: string } | null }

export interface Db {
  owner: pg.Client
  /** A new connection as `role` (password set by freshDb). */
  connect(role: 'bt_gateway' | 'bt_sweeper' | 'bt_backup'): Promise<pg.Client>
  /** Close every connection; call from the test file's top-level after(). */
  close(): Promise<void>
}

export async function freshDb(name: string): Promise<Db> {
  const url = (user?: string, password?: string) => {
    const u = new URL(OWNER_URL)
    u.pathname = `/${name}`
    if (user) u.username = user
    if (password) u.password = password
    return u.toString()
  }
  const admin = new pg.Client(OWNER_URL)
  await admin.connect()
  await admin.query(`drop database if exists ${name} with (force)`)
  await admin.query(`create database ${name}`)
  await admin.end()
  execFileSync(new URL('../migrate.sh', import.meta.url).pathname, { env: { ...process.env, DATABASE_URL: url() }, stdio: 'pipe' })

  const owner = new pg.Client(url())
  await owner.connect()
  for (const role of ['bt_gateway', 'bt_sweeper', 'bt_backup']) await owner.query(`alter role ${role} password 'test'`)
  const clients: pg.Client[] = [owner]
  return {
    owner,
    async connect(role) {
      const c = new pg.Client(url(role, 'test'))
      await c.connect()
      clients.push(c)
      return c
    },
    async close() {
      await Promise.all(clients.map((c) => c.end()))
    },
  }
}

/** The calls the transport makes, bound to one bt_gateway connection. */
export function gate(gw: pg.Client) {
  const one = async (sql: string, params: unknown[]) => (await gw.query(sql, params)).rows[0].r as Envelope
  return {
    signIn: (identity: object) => one('select gate.sign_in($1::jsonb) as r', [JSON.stringify(identity)]),
    call: (token: string, body: object, client = gw) =>
      client.query('select gate.call($1, $2::jsonb) as r', [token, JSON.stringify(body)]).then((r) => r.rows[0].r as Envelope),
    run: (token: string, name: string, args: object, requestId: string = randomUUID(), client = gw) =>
      client
        .query('select gate.call($1, $2::jsonb) as r', [token, JSON.stringify({ since: 0, command: { name, args, requestId } })])
        .then((r) => r.rows[0].r as Envelope),
    upload: (token: string, body: object) => one('select gate.upload($1, $2::jsonb) as r', [token, JSON.stringify(body)]),
    uploadDone: (token: string, body: object) => one('select gate.upload_done($1, $2::jsonb) as r', [token, JSON.stringify(body)]),
    file: (token: string, id: string, variant: string) => one('select gate.file($1, $2::uuid, $3) as r', [token, id, variant]),
  }
}
