import type { IncomingMessage } from "node:http"

import { loadEnv, type Plugin } from "vite"

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value)
  }
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  })
}

/**
 * Serves the backend (server/router.ts) under /api in `npm run dev`, so the
 * whole app runs from one command. Production uses api/index.ts on Vercel.
 */
export function socratesApi(): Plugin {
  return {
    name: "socrates-api",
    configureServer(server) {
      // Server-side secrets (ANTHROPIC_API_KEY, ELEVENLABS_*) from .env.local, never exposed to the client.
      const env = loadEnv(server.config.mode, server.config.root, "")
      for (const [key, value] of Object.entries(env)) process.env[key] ??= value

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next()
        try {
          const { handle } = (await server.ssrLoadModule("/server/router.ts")) as {
            handle: (request: Request) => Promise<Response>
          }
          const response = await handle(await toRequest(req))
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          // The browser dropped the request (reload, navigation, HMR): nobody is left to answer.
          if (req.socket.destroyed) return
          next(error)
        }
      })
    },
  }
}
