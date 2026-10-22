// The edge: a same-origin front door for the job board. It runs only for /api and /api/* (run_worker_first);
// Cloudflare serves the SPA from ../web/dist without running it.
//
// It knows nothing about the API: no routes, cookies or commands. It forwards the request to the Go service
// on Cloud Run with the shared edge key and returns the response untouched, so status, Location and every
// Set-Cookie reach the browser exactly as Go wrote them. Go answers a bare 404 to anything without the key.

export interface Env {
  /** https://crew-api-<hash>-as.a.run.app, the Cloud Run service URL. Var. */
  API_ORIGIN: string
  /** Shared with the Go service's EDGE_KEY. Worker secret. */
  EDGE_KEY: string
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const headers = new Headers(req.headers)
    headers.delete('host')
    headers.set('x-bt-edge', env.EDGE_KEY) // overwrites anything a client sent
    const init: RequestInit & { duplex: 'half' } = {
      method: req.method,
      headers,
      body: req.body, // streamed, never buffered; null for GET/HEAD
      duplex: 'half',
      redirect: 'manual', // OAuth and /api/files/{id} answer with 302s meant for the browser
    }
    try {
      return await fetch(new URL(url.pathname + url.search, env.API_ORIGIN), init)
    } catch {
      return new Response('Bad gateway', { status: 502, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } })
    }
  },
} satisfies ExportedHandler<Env>
