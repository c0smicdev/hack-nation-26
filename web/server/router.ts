import type { User } from "@supabase/supabase-js"

import { toSummary } from "../src/lib/api/summary.js"
import type {
  AskRequest,
  CaptureStatus,
  DebriefAnswer,
  DecisionCheck,
  NewSession,
  NewSessionEvent,
  NewSupervision,
  ScreenQuestion,
  TeachBackReply,
  Tick,
  Language,
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
import { getProfile, personForUser, updateProfile } from "./profile.js"
import { askAboutScreen, processSupervisionTick, startSupervision } from "./supervise.js"
import { localize, prepareLanguage } from "./translate.js"
import { LANGUAGES } from "./language.js"
import { ask, checkDecision, draftWorkflow, voiceSession } from "./teach.js"
import { answerDebrief, finishCapture, replyTeachBack, requestTeachBack } from "./workmap.js"
import { addEvent, getRuntime, getWorkMap, HttpError, sessionAt, store } from "./store.js"

/** The reader's UI language (sent with every request), else the one in their profile. */
const languageOf = async (user: User | undefined, language: Language | undefined) =>
  language ?? (await getProfile(user)).preferences.language

type Params = Record<string, string>
type Handler = (ctx: {
  params: Params
  body: () => Promise<unknown>
  url: URL
  /** Signed-in Supabase user; undefined when login is off. */
  user?: User
  /** The UI language the request came from (`X-Socrates-Language`). */
  language?: Language
}) => unknown

const routes: [method: string, pattern: string, handler: Handler][] = [
  ["GET", "/me", ({ user }) => getProfile(user)],
  [
    "PATCH",
    "/me",
    async ({ user, body }) => {
      const profile = await updateProfile(user, await body())
      // Get every workflow ready in the new language before they open it.
      prepareLanguage(profile.preferences.language)
      return profile
    },
  ],

  [
    "GET",
    "/workmaps",
    async ({ language }) =>
      (await Promise.all(store.workMaps.map((m) => localize(m, language)))).map(toSummary),
  ],
  [
    "POST",
    "/workmaps/related",
    async ({ body }) => {
      const { task } = (await body()) as { task: string }
      return (await findRelatedWorkMaps(task)).map(toSummary)
    },
  ],
  ["GET", "/workmaps/:id", ({ params, language }) => localize(getWorkMap(params.id), language)],
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
    async ({ params, body, user, language }) =>
      checkDecision(params.id, (await body()) as DecisionCheck, await languageOf(user, language)),
  ],
  [
    "POST",
    "/workmaps/:id/supervisions",
    async ({ params, body, user, language }) =>
      startSupervision(
        params.id,
        (await body()) as NewSupervision,
        await languageOf(user, language),
      ),
  ],
  [
    "POST",
    "/supervisions/:id/ticks",
    async ({ params, body }) => processSupervisionTick(params.id, (await body()) as Tick),
  ],
  [
    "POST",
    "/supervisions/:id/ask",
    async ({ params, body }) => askAboutScreen(params.id, (await body()) as ScreenQuestion),
  ],

  ["GET", "/sessions", () => [...store.sessions.values()].reverse().map(sessionView)],
  [
    "POST",
    "/sessions",
    async ({ body, user, language }) => {
      const input = (await body()) as NewSession
      const expert = user && (await personForUser(user, input.expertName, input.expertRole))
      const { preferences } = await getProfile(user)
      return createSession(input, expert, preferences.chattiness, language ?? preferences.language)
    },
  ],
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
  [
    "POST",
    "/ask",
    async ({ body, user, language }) =>
      ask((await body()) as AskRequest, await languageOf(user, language)),
  ],
  [
    "POST",
    "/workflows/draft",
    async ({ body, user, language }) =>
      draftWorkflow((await body()) as WorkflowDraftRequest, await languageOf(user, language)),
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
      const user = await requireUser(request)
      const header = request.headers.get("x-socrates-language")
      const language = LANGUAGES.find((l) => l === header)
      const result = await withDb(method !== "GET", () =>
        Promise.resolve(handler({ params, url, user, language, body: () => request.json() })),
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
