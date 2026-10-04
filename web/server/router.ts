import { toSummary } from "../src/lib/api/summary.js"
import type {
  AskRequest,
  CaptureStatus,
  DebriefAnswer,
  DecisionCheck,
  NewSession,
  NewSessionEvent,
  TeachBackReply,
  Tick,
  VoiceRole,
  WorkflowDraftRequest,
} from "../src/lib/api/types.js"
import {
  createSession,
  findRelatedWorkMaps,
  liveSteps,
  processTick,
  recordEvent,
  sessionView,
  updateSession,
} from "./capture.js"
import { requireUser } from "./auth.js"
import { loadFrame, withDb } from "./db.js"
import { ask, checkDecision, draftWorkflow, voiceSession } from "./teach.js"
import { answerDebrief, finishCapture, replyTeachBack, requestTeachBack } from "./workmap.js"
import { addEvent, getRuntime, getWorkMap, HttpError, sessionAt, store } from "./store.js"

type Params = Record<string, string>
type Handler = (ctx: { params: Params; body: () => Promise<unknown>; url: URL }) => unknown

const routes: [method: string, pattern: string, handler: Handler][] = [
  ["GET", "/workmaps", () => store.workMaps.map(toSummary)],
  [
    "POST",
    "/workmaps/related",
    async ({ body }) => {
      const { task } = (await body()) as { task: string }
      return (await findRelatedWorkMaps(task)).map(toSummary)
    },
  ],
  ["GET", "/workmaps/:id", ({ params }) => getWorkMap(params.id)],
  [
    "POST",
    "/workmaps/:id/debrief/:itemId",
    async ({ params, body }) =>
      answerDebrief(params.id, params.itemId, (await body()) as DebriefAnswer),
  ],
  ["POST", "/workmaps/:id/teach-back", ({ params }) => requestTeachBack(params.id)],
  [
    "POST",
    "/workmaps/:id/teach-back/reply",
    async ({ params, body }) => replyTeachBack(params.id, (await body()) as TeachBackReply),
  ],
  [
    "POST",
    "/workmaps/:id/check",
    async ({ params, body }) => checkDecision(params.id, (await body()) as DecisionCheck),
  ],

  ["GET", "/sessions", () => [...store.sessions.values()].reverse().map(sessionView)],
  ["POST", "/sessions", async ({ body }) => createSession((await body()) as NewSession)],
  ["GET", "/sessions/:id", ({ params }) => sessionView(getRuntime(params.id))],
  [
    "PATCH",
    "/sessions/:id",
    async ({ params, body }) =>
      updateSession(params.id, (await body()) as Parameters<typeof updateSession>[1]),
  ],
  [
    "GET",
    "/sessions/:id/events",
    ({ params }) => (store.sessions.has(params.id) ? getRuntime(params.id).events : []),
  ],
  [
    "POST",
    "/sessions/:id/events",
    async ({ params, body }) => recordEvent(params.id, (await body()) as NewSessionEvent),
  ],
  [
    "POST",
    "/sessions/:id/ticks",
    async ({ params, body }) => processTick(params.id, (await body()) as Tick),
  ],
  [
    "GET",
    "/sessions/:id/steps",
    ({ params }) => (store.sessions.has(params.id) ? liveSteps(getRuntime(params.id)) : []),
  ],
  ["POST", "/sessions/:id/finish", ({ params }) => finishCapture(params.id)],

  ["GET", "/capture/status", () => store.captureStatus],
  [
    "PATCH",
    "/capture/status",
    async ({ body }) => {
      const patch = (await body()) as Partial<CaptureStatus>
      const before = store.captureStatus
      store.captureStatus = {
        ...before,
        ...patch,
        signals: { ...before.signals, ...patch.signals },
      }
      const live = before.liveSessionId && store.sessions.get(before.liveSessionId)
      if (live && patch.offTheRecord !== undefined && patch.offTheRecord !== before.offTheRecord) {
        // Only the span is logged, never what happened in it.
        addEvent(live, {
          at: sessionAt(live),
          kind: "off_record",
          text: patch.offTheRecord
            ? "Expert went off the record — nothing is captured"
            : "Back on the record",
        })
      }
      return store.captureStatus
    },
  ],

  ["GET", "/voice/:role", ({ params }) => voiceSession(params.role as VoiceRole)],
  ["POST", "/ask", async ({ body }) => ask((await body()) as AskRequest)],
  [
    "POST",
    "/workflows/draft",
    async ({ body }) => draftWorkflow((await body()) as WorkflowDraftRequest),
  ],
]

function match(pattern: string, path: string): Params | undefined {
  const keys: string[] = []
  const regex = new RegExp(
    `^${pattern.replace(/:(\w+)/g, (_, key: string) => {
      keys.push(key)
      return "([^/]+)"
    })}/?$`,
  )
  const m = regex.exec(path)
  if (!m) return undefined
  return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "Content-Type": "application/json" },
  })

/** Web-standard handler: used by the Vite dev middleware and the Vercel function. */
export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // Vercel rewrites /api/* to /api?route=*; in dev we see the real path.
  const path = url.searchParams.get("route") ?? url.pathname.replace(/^\/api/, "")

  // Frames are loaded by <img> tags, which can't send a bearer token, so they skip auth.
  const frame = /^\/?frames\/([^/]+)$/.exec(path)
  if (request.method === "GET" && frame) {
    const stored = await loadFrame(frame[1])
    if (!stored) return json({ error: "Frame not found" }, 404)
    return new Response(new Uint8Array(stored.data), {
      headers: { "Content-Type": stored.mime, "Cache-Control": "private, max-age=86400" },
    })
  }

  const normalized = path.startsWith("/") ? path : `/${path}`
  for (const [method, pattern, handler] of routes) {
    if (method !== request.method) continue
    const params = match(pattern, normalized)
    if (!params) continue
    try {
      await requireUser(request)
      const result = await withDb(method !== "GET", () =>
        Promise.resolve(handler({ params, url, body: () => request.json() })),
      )
      return json(result)
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      console.error(`[api] ${request.method} ${normalized}`, error)
      return json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  }
  return json({ error: `No route for ${request.method} ${normalized}` }, 404)
}
