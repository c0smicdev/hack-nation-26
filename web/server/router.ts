import type { User } from "@supabase/supabase-js"
import { z } from "zod"

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
import { asUser, canRead, currentUserId, readableWorkMaps, requireAccess } from "./access.js"
import {
  MAX_IMAGE_BYTES,
  PRIVACY_POLICY,
  PrivacyError,
  protectTexts,
  protectValue,
} from "./privacy.js"
import { setSessionPrivacy } from "./session-privacy.js"
import { getProfile, personForUser, updateProfile } from "./profile.js"
import { ask, checkDecision, draftWorkflow, voiceSession } from "./teach.js"
import { answerDebrief, finishCapture, replyTeachBack, requestTeachBack } from "./workmap.js"
import { addEvent, getRuntime, getWorkMap, HttpError, sessionAt, store } from "./store.js"

type Params = Record<string, string>
const tickInput = z
  .object({
    at: z.number().finite().nonnegative(),
    image: z
      .string()
      .max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
      .optional(),
    mime: z.enum(["image/png", "image/jpeg"]).optional(),
    masks: z
      .array(
        z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict(),
      )
      .max(100)
      .optional(),
    typing: z.boolean(),
    speaking: z.boolean(),
    erp: z
      .array(
        z
          .object({
            at: z.number().finite().nonnegative(),
            kind: z.enum(["navigate", "field_change", "action"]),
            text: z.string().max(20_000),
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
type Handler = (ctx: {
  params: Params
  body: () => Promise<unknown>
  url: URL
  /** Signed-in Supabase user; undefined when login is off. */
  user?: User
}) => unknown

const routes: [method: string, pattern: string, handler: Handler][] = [
  ["GET", "/me", ({ user }) => getProfile(user)],
  ["PATCH", "/me", async ({ user, body }) => updateProfile(user, await body())],

  ["GET", "/workmaps", () => readableWorkMaps().map(toSummary)],
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

  [
    "GET",
    "/sessions",
    () =>
      [...store.sessions.values()]
        .filter((r) => canRead(r.session.id))
        .reverse()
        .map(sessionView),
  ],
  [
    "POST",
    "/sessions",
    async ({ body, user }) => {
      const input = (await body()) as NewSession
      const expert = user && (await personForUser(user, input.expertName, input.expertRole))
      return createSession(input, expert)
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
    async ({ params, body }) =>
      processTick(params.id, tickInput.parse(await body()) satisfies Tick),
  ],
  [
    "GET",
    "/sessions/:id/steps",
    ({ params }) => (store.sessions.has(params.id) ? liveSteps(getRuntime(params.id)) : []),
  ],
  ["POST", "/sessions/:id/finish", ({ params }) => finishCapture(params.id)],

  ["GET", "/capture/status", captureStatusForCaller],
  [
    "PATCH",
    "/capture/status",
    async ({ body }) => {
      const patch = (await body()) as Partial<CaptureStatus>
      const before = captureStatusForCaller()
      if (before.liveSessionId) requireAccess(before.liveSessionId, true)
      if (patch.liveSessionId) requireAccess(patch.liveSessionId, true)
      const live = before.liveSessionId && getRuntime(before.liveSessionId)
      if (live && patch.offTheRecord !== undefined && patch.offTheRecord !== before.offTheRecord) {
        await setSessionPrivacy(live, patch.offTheRecord)
        addEvent(live, {
          at: sessionAt(live),
          kind: "off_record",
          text: patch.offTheRecord ? "Off the record" : "Back on the record",
        })
      }
      store.captureStatus = {
        ...before,
        ...patch,
        signals: { ...before.signals, ...patch.signals },
      }
      return store.captureStatus
    },
  ],

  ["GET", "/voice/:role", ({ params }) => voiceSession(params.role as VoiceRole)],
  [
    "POST",
    "/privacy/text",
    async ({ body }) => {
      const input = z.object({ texts: z.array(z.string()).max(2000) }).parse(await body())
      const results = await protectTexts(input.texts)
      return {
        texts: results.map((r) => r.text),
        privacy: {
          policyVersion: PRIVACY_POLICY,
          redactedCount: results.reduce((sum, r) => sum + r.redactedCount, 0),
        },
      }
    },
  ],
  ["POST", "/ask", async ({ body }) => ask((await body()) as AskRequest)],
  [
    "POST",
    "/workflows/draft",
    async ({ body }) => draftWorkflow((await body()) as WorkflowDraftRequest),
  ],
]

function captureStatusForCaller(): CaptureStatus {
  const userId = currentUserId()
  const session = [...store.sessions.values()]
    .reverse()
    .find(
      (runtime) =>
        ["intake", "live"].includes(runtime.session.status) &&
        (!userId || store.access.get(runtime.session.id)?.ownerId === userId),
    )
  if (!session)
    return {
      active: false,
      signals: { screen: false, microphone: false, erp: false },
      offTheRecord: false,
    }
  return {
    ...store.captureStatus,
    active: true,
    liveSessionId: session.session.id,
    offTheRecord: !!session.session.offTheRecord,
  }
}

async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, "Missing request body")
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.length
    if (size > (MAX_IMAGE_BYTES * 4) / 3 + 200_000) {
      await reader.cancel()
      throw new HttpError(413, "Request is too large")
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    throw new HttpError(400, "Invalid request body")
  }
}

function errorResponse(error: unknown) {
  if (error instanceof PrivacyError)
    return json({ error: error.message, code: error.code }, error.status)
  if (error instanceof HttpError) return json({ error: error.message }, error.status)
  if (error instanceof z.ZodError) return json({ error: "Invalid request body" }, 400)
  console.error("[api] request failed; request contents omitted")
  return json({ error: "Request could not complete. Please retry." }, 500)
}

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

  const frame = /^\/?frames\/([^/]+)$/.exec(path)
  if (request.method === "GET" && frame) {
    try {
      const user = await requireUser(request)
      return await asUser(user?.id, () =>
        withDb(false, async () => {
          const stored = await loadFrame(frame[1])
          if (
            !stored ||
            (!canRead(stored.sessionId) &&
              !readableWorkMaps().some((map) =>
                map.steps.some((step) => step.screen.screenshotUrl === `/api/frames/${frame[1]}`),
              ))
          )
            throw new HttpError(404, "Frame not found")
          return new Response(new Uint8Array(stored.data), {
            headers: {
              "Content-Type": stored.mime,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          })
        }),
      )
    } catch (error) {
      return errorResponse(error)
    }
  }

  const normalized = path.startsWith("/") ? path : `/${path}`
  for (const [method, pattern, handler] of routes) {
    if (method !== request.method) continue
    const params = match(pattern, normalized)
    if (!params) continue
    try {
      const user = await requireUser(request)
      const result = await asUser(user?.id, () =>
        withDb(method !== "GET", async () => {
          const sessionId = normalized.startsWith("/sessions/") ? params.id : undefined
          const mapId = normalized.startsWith("/workmaps/") ? params.id : undefined
          if (sessionId) requireAccess(sessionId, method !== "GET")
          if (mapId) requireAccess(mapId, method !== "GET" && !normalized.endsWith("/check"))
          const output = await handler({
            params,
            url,
            user,
            body: async () => {
              const input = await readBody(request)
              // Image bytes go only through protectImage; profiles are account-owned identity.
              return normalized.endsWith("/ticks") ||
                normalized === "/privacy/text" ||
                normalized === "/me"
                ? input
                : protectValue(input)
            },
          })
          return normalized === "/me" ||
            normalized.startsWith("/voice/") ||
            normalized === "/privacy/text"
            ? output
            : protectValue(output)
        }),
      )
      return json(result)
    } catch (error) {
      return errorResponse(error)
    }
  }
  return json({ error: "Route not found" }, 404)
}
