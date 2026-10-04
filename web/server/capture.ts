import { z } from "zod"

import type {
  CaptureSession,
  ErpSignal,
  ID,
  LiveQuestion,
  LiveStep,
  NewSession,
  NewSessionEvent,
  Person,
  ScreenMoment,
  SessionEvent,
  Tick,
  TickResult,
  WorkMap,
} from "../src/lib/api/types.js"
import { locateFocus } from "./focus.js"
import { imageBlock, models, prompt, structured, text } from "./llm.js"
import {
  addEvent,
  type CandidateStep,
  frameUrl,
  getRuntime,
  getWorkMap,
  HttpError,
  newId,
  type OpenQuestion,
  saveFrame,
  type SessionRuntime,
  sessionAt,
  store,
} from "./store.js"

/* Sessions ---------------------------------------------------------- */

function personFor(name: string, role: string): Person {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const known = store.workMaps.find((m) => m.expert.name.toLowerCase() === name.toLowerCase())
  return known?.expert ?? { id: `p-${slug}`, name, role }
}

export function createSession(input: NewSession): CaptureSession {
  if (!input.task.trim() || !input.expertName.trim()) {
    throw new HttpError(400, "task and expertName are required")
  }
  const session: CaptureSession = {
    id: newId("ses"),
    title: input.title.trim() || input.task.trim().slice(0, 60),
    task: input.task.trim(),
    expert: personFor(input.expertName.trim(), input.expertRole.trim() || "Expert"),
    startedAt: new Date().toISOString(),
    durationSec: 0,
    status: "intake",
    eventCount: 0,
    questionsAsked: 0,
  }
  store.sessions.set(session.id, {
    session,
    startedAtMs: Date.now(),
    events: [],
    candidates: [],
    questions: [],
    visionBusy: false,
    pendingErp: [],
    pendingFocus: new Set(),
  })
  store.captureStatus = {
    ...store.captureStatus,
    active: true,
    offTheRecord: false,
    liveSessionId: session.id,
  }
  return session
}

export function sessionView(runtime: SessionRuntime): CaptureSession {
  const live = runtime.session.status === "intake" || runtime.session.status === "live"
  return {
    ...runtime.session,
    durationSec: live ? Math.round(sessionAt(runtime)) : runtime.session.durationSec,
  }
}

export function updateSession(
  sessionId: ID,
  patch: { status?: "live"; task?: string; basedOnWorkMapId?: ID | null },
): CaptureSession {
  const runtime = getRuntime(sessionId)
  const { session } = runtime
  if (patch.task) session.task = patch.task
  if (patch.basedOnWorkMapId !== undefined) {
    if (patch.basedOnWorkMapId) getWorkMap(patch.basedOnWorkMapId)
    session.basedOnWorkMapId = patch.basedOnWorkMapId ?? undefined
  }
  if (patch.status === "live" && session.status === "intake") session.status = "live"
  return sessionView(runtime)
}

/* Ticks ------------------------------------------------------------- */

const VisionResult = z.object({
  screen: z.string(),
  events: z.array(
    z.object({
      text: z.string(),
      important: z.boolean(),
      candidateStepId: z.string().nullable(),
      stepTitle: z.string().nullable(),
      stepKind: z.enum(["routine", "judgment"]).nullable(),
      decision: z.string().nullable(),
      matchedStepId: z.string().nullable(),
      sameDecision: z.boolean().nullable(),
    }),
  ),
  question: z
    .object({
      text: z.string(),
      guardrail: z.boolean(),
      timeSensitive: z.boolean(),
      aboutEventIndex: z.number().nullable(),
      aboutCandidateStepId: z.string().nullable(),
    })
    .nullable(),
  debriefQuestions: z.array(z.string()),
})

/**
 * Boxes the step's element on its screenshot without holding up the tick (one more model call);
 * finishCapture waits for these before the Work Map is written. A failed lookup leaves no box.
 */
function locateInBackground(runtime: SessionRuntime, screen: ScreenMoment, frameId: ID) {
  const frame = store.frames.get(frameId)
  if (!frame) return
  const job = locateFocus(frame.data, screen.caption, frame.mime)
    .then((focus) => {
      screen.focus = focus
    })
    .catch((error: unknown) => {
      console.warn(`[focus] no box for "${screen.caption}":`, error)
    })
    .finally(() => runtime.pendingFocus.delete(job))
  runtime.pendingFocus.add(job)
}

const normalize = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^a-z0-9€]+/g, " ")
    .trim()

/** What the saved Work Map (memory) already knows, so vision doesn't ask it again. */
export function memoryContext(map: WorkMap | undefined) {
  if (!map) return "No saved Work Map matches this task. Everything is new."
  const steps = map.steps.map((s) => {
    const rules = s.guardrails.map((g) => `      guardrail (${g.kind}): ${g.rule}`)
    const cases = s.edgeCases.map((e) => `      edge case: if ${e.when} → ${e.then}`)
    return [
      `  [${s.id}] ${s.title} — decision: ${s.decision}`,
      s.reason ? `      why (${map.expert.name}): "${s.reason.text}"` : "",
      ...rules,
      ...cases,
    ]
      .filter(Boolean)
      .join("\n")
  })
  const answered = map.debrief
    .filter((d) => d.answer)
    .map((d) => `  Q: ${d.question}\n  A: "${d.answer!.text}"`)
  return [
    `Saved Work Map "${map.title}" by ${map.expert.name}:`,
    ...steps,
    answered.length ? `Answered in an earlier debrief:\n${answered.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function contextFor(runtime: SessionRuntime, erpLines: string[]) {
  const { session } = runtime
  const base = session.basedOnWorkMapId ? getWorkMap(session.basedOnWorkMapId) : undefined
  const recent = runtime.events.slice(-15).map((e) => `  ${e.at.toFixed(0)}s ${e.kind}: ${e.text}`)
  const candidates = runtime.candidates.map((c) => `  [${c.id}] ${c.title} — ${c.decision}`)
  // Live vs. debrief and guardrail flags let vision keep the 3–5 live questions (≥1 guardrail) budget.
  const asked = runtime.questions.map((q) => {
    const state = q.askedLive ? "asked live" : q.screen ? "waiting to ask live" : "for the debrief"
    const answer = q.answer ? ` → "${q.answer.text}"` : ""
    return `  ${state}${q.guardrail ? " (guardrail)" : ""}: ${q.question}${answer}`
  })
  return [
    `Task (in the expert's words): ${session.task}`,
    `Expert: ${session.expert.name}, ${session.expert.role}`,
    memoryContext(base),
    `Candidate steps so far:\n${candidates.join("\n") || "  (none)"}`,
    `Recent events (narration = expert speaking):\n${recent.join("\n") || "  (none)"}`,
    `Questions already asked or queued:\n${asked.join("\n") || "  (none)"}`,
    `Application signals since the previous screenshot:\n${erpLines.join("\n") || "  (none)"}`,
  ].join("\n\n")
}

/** Candidate steps as the recording page shows them. */
export function liveSteps(runtime: SessionRuntime): LiveStep[] {
  return runtime.candidates.map((c) => ({
    id: c.id,
    at: c.at,
    title: c.title,
    kind: c.kind,
    decision: c.decision,
    screenshotUrl: c.screen.screenshotUrl,
    deviation: c.deviation,
  }))
}

const empty = (processed: boolean, screen?: string): TickResult => ({
  processed,
  screen,
  events: [],
  questions: [],
})

export async function processTick(sessionId: ID, tick: Tick): Promise<TickResult> {
  const runtime = getRuntime(sessionId)
  const status = store.captureStatus
  // Off the record: send nothing, store nothing, ask nothing.
  if (status.offTheRecord && status.liveSessionId === sessionId) return empty(false)
  if (runtime.session.status !== "live") return empty(false)

  runtime.pendingErp.push(...tick.erp)
  if (!tick.image) return empty(true, runtime.lastScreen)
  // One vision call at a time; drop this frame rather than queue it (it would be stale).
  if (runtime.visionBusy) return empty(false, runtime.lastScreen)

  const frameId = saveFrame(tick.image)
  const previous = runtime.lastFrameId ? store.frames.get(runtime.lastFrameId) : undefined
  const current = store.frames.get(frameId)!
  const erp = runtime.pendingErp.splice(0)
  runtime.lastFrameId = frameId

  runtime.visionBusy = true
  let result: z.infer<typeof VisionResult>
  try {
    result = await structured({
      model: models.vision,
      effort: "low",
      maxTokens: 4000,
      system: prompt("vision-events"),
      schema: VisionResult,
      content: [
        text(
          contextFor(
            runtime,
            erp.map((s) => `  ${s.at.toFixed(0)}s ${s.kind}: ${s.text}`),
          ),
        ),
        ...(previous ? [text("Previous screenshot:"), imageBlock(previous.data)] : []),
        text(previous ? "Current screenshot:" : "Current screenshot (first of the session):"),
        imageBlock(current.data),
      ],
    })
  } catch (error) {
    // Put the signals back so the next frame still sees them.
    runtime.pendingErp.unshift(...erp)
    throw error
  } finally {
    runtime.visionBusy = false
  }

  return applyVision(runtime, tick.at, frameId, result, erp)
}

function applyVision(
  runtime: SessionRuntime,
  at: number,
  frameId: ID,
  result: z.infer<typeof VisionResult>,
  erp: ErpSignal[],
): TickResult {
  const { session } = runtime
  const screenshotUrl = frameUrl(frameId)
  const base = session.basedOnWorkMapId ? getWorkMap(session.basedOnWorkMapId) : undefined
  const events: SessionEvent[] = []
  const stepForEvent: (ID | undefined)[] = []
  runtime.lastScreen = result.screen

  for (const e of result.events) {
    const matchedStepId = base?.steps.some((s) => s.id === e.matchedStepId)
      ? e.matchedStepId!
      : undefined
    const deviation = matchedStepId ? e.sameDecision === false : undefined
    let stepId: ID | undefined

    // Known step with the same decision: link it, don't create a step and don't ask.
    const known = matchedStepId && !deviation
    if (e.important && !known) {
      const screen: ScreenMoment = {
        sessionId: session.id,
        at,
        screenshotUrl,
        caption: e.text,
      }
      locateInBackground(runtime, screen, frameId)
      const existing = runtime.candidates.find((c) => c.id === e.candidateStepId)
      if (existing) {
        existing.decision = e.decision ?? existing.decision
        existing.kind = e.stepKind === "judgment" ? "judgment" : existing.kind
        existing.screen = screen
        stepId = existing.id
      } else {
        const candidate: CandidateStep = {
          id: newId("st"),
          at,
          title: e.stepTitle ?? e.text,
          kind: e.stepKind ?? "routine",
          decision: e.decision ?? e.text,
          screen,
          matchedStepId,
          deviation,
        }
        runtime.candidates.push(candidate)
        stepId = candidate.id
      }
    }
    stepForEvent.push(stepId)
    events.push(
      addEvent(runtime, {
        at,
        kind: "screen",
        text: e.text,
        important: e.important,
        screenshotUrl,
        matchedStepId,
        deviation,
      }),
    )
  }

  const seen = new Set(runtime.questions.map((q) => normalize(q.question)))
  const questions: LiveQuestion[] = []
  const q = result.question
  if (q && !seen.has(normalize(q.text))) {
    const stepId =
      (q.aboutEventIndex != null ? stepForEvent[q.aboutEventIndex] : undefined) ??
      runtime.candidates.find((c) => c.id === q.aboutCandidateStepId)?.id
    // Hard rule: never ask live before the expert has decided something, or the question leads them
    // ("should this go to another account?") and spoils the decision we want to learn. ERP signals
    // are exact; without any, trust vision's judgment events. A blocked question waits for the debrief.
    const decided = erp.length
      ? erp.some((s) => s.kind !== "navigate")
      : result.events.some((e) => e.important && e.stepKind === "judgment")
    const live = q.timeSensitive && decided
    const open: OpenQuestion = {
      id: newId("q"),
      at,
      question: q.text,
      stepId,
      guardrail: q.guardrail,
      screen: live ? result.screen : undefined,
      askedLive: false,
    }
    runtime.questions.push(open)
    seen.add(normalize(q.text))
    if (live) {
      questions.push({
        id: open.id,
        question: open.question,
        stepId,
        guardrail: open.guardrail,
        at,
        screen: result.screen,
      })
    }
  }
  for (const question of result.debriefQuestions) {
    if (seen.has(normalize(question))) continue
    seen.add(normalize(question))
    runtime.questions.push({ id: newId("q"), at, question, guardrail: false, askedLive: false })
  }

  return { processed: true, screen: result.screen, events, questions, steps: liveSteps(runtime) }
}

/* Events from the session page (speech, questions asked, …) ---------- */

export function recordEvent(sessionId: ID, input: NewSessionEvent): SessionEvent {
  const runtime = getRuntime(sessionId)
  const status = store.captureStatus
  const offRecord = status.offTheRecord && status.liveSessionId === sessionId
  if (offRecord && input.kind !== "off_record") {
    // Acknowledge without storing anything.
    return { id: "not-recorded", sessionId, ...input }
  }

  const question = input.questionId
    ? runtime.questions.find((q) => q.id === input.questionId)
    : undefined
  if (input.kind === "question" && question && !question.askedLive) {
    question.askedLive = true
    runtime.session.questionsAsked += 1
  }
  if (input.kind === "speech" && question) {
    // The expert's answer, in their own words. Several utterances can make up one answer.
    question.answer = question.answer
      ? { ...question.answer, text: `${question.answer.text} ${input.text}` }
      : {
          text: input.text,
          speaker: runtime.session.expert,
          source: "live_question",
          prompt: question.question,
          at: input.at,
        }
  }
  return addEvent(runtime, input)
}

/* Memory ------------------------------------------------------------ */

const MemoryMatch = z.object({
  matches: z.array(z.object({ workMapId: z.string(), why: z.string() })),
})

/** Confirmed Work Maps that describe the same (or an overlapping) task. */
export async function findRelatedWorkMaps(task: string) {
  const confirmed = store.workMaps.filter((m) => m.status === "confirmed")
  if (!task.trim() || confirmed.length === 0) return []
  const catalog = confirmed
    .map(
      (m) =>
        `[${m.id}] ${m.title} (${m.domain}, by ${m.expert.name})\n  ${m.summary}\n  When: ${m.trigger}`,
    )
    .join("\n")
  const { matches } = await structured({
    model: models.reasoning,
    effort: "low",
    maxTokens: 2000,
    system: prompt("memory-match"),
    schema: MemoryMatch,
    content: [text(`Task the expert is about to do:\n${task}\n\nSaved Work Maps:\n${catalog}`)],
  })
  return matches
    .map((match) => confirmed.find((m) => m.id === match.workMapId))
    .filter((m): m is WorkMap => !!m)
}
