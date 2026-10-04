import { z } from "zod"

import type {
  DebriefAnswer,
  ID,
  Person,
  Quote,
  ScreenMoment,
  TeachBackReply,
  WorkMap,
  WorkMapStep,
} from "../src/lib/api/types.js"
import { memoryContext } from "./capture.js"
import { models, prompt, structured, text } from "./llm.js"
import {
  getRuntime,
  getWorkMap,
  HttpError,
  newId,
  type SessionRuntime,
  saveWorkMap,
  sessionAt,
  store,
} from "./store.js"
import { prepareWorkMap } from "./translate.js"

/**
 * The LLM never writes quotes itself: it points at utterances by id, and we copy
 * the expert's exact words. That keeps "every step links to the expert's own words" true.
 */
type QuotePool = Map<string, Quote>

const GuardrailOut = z.object({
  kind: z.enum(["limit", "stop_and_ask", "never"]),
  rule: z.string(),
  escalateTo: z.string().nullable(),
  quoteId: z.string().nullable(),
})
const EdgeCaseOut = z.object({ when: z.string(), then: z.string(), quoteId: z.string().nullable() })
const StepOut = z.object({
  fromId: z.string().nullable(),
  title: z.string(),
  kind: z.enum(["routine", "judgment"]),
  decision: z.string(),
  reasonQuoteId: z.string().nullable(),
  guardrails: z.array(GuardrailOut),
  edgeCases: z.array(EdgeCaseOut),
})
const MapOut = z.object({
  title: z.string(),
  summary: z.string(),
  domain: z.string(),
  trigger: z.string(),
  steps: z.array(StepOut),
})
const DraftOut = MapOut.extend({
  debriefQuestions: z.array(z.object({ question: z.string(), stepIndex: z.number().nullable() })),
})

function poolText(pool: QuotePool) {
  return [...pool.entries()]
    .map(
      ([id, q]) =>
        `  [${id}] ${q.at.toFixed(0)}s ${q.prompt ? `(answer to "${q.prompt}") ` : ""}"${q.text}"`,
    )
    .join("\n")
}

function toSteps(
  steps: z.infer<typeof StepOut>[],
  pool: QuotePool,
  screenFor: (fromId: string | null, index: number) => ScreenMoment,
  idFor: (fromId: string | null) => ID,
): WorkMapStep[] {
  const quote = (id: string | null) => (id ? pool.get(id) : undefined)
  return steps.map((s, i) => ({
    id: idFor(s.fromId),
    title: s.title,
    kind: s.kind,
    screen: screenFor(s.fromId, i),
    decision: s.decision,
    reason: quote(s.reasonQuoteId),
    guardrails: s.guardrails.map((g) => ({
      id: newId("g"),
      kind: g.kind,
      rule: g.rule,
      escalateTo: g.escalateTo ?? undefined,
      quote: quote(g.quoteId),
    })),
    edgeCases: s.edgeCases.map((e) => ({
      id: newId("e"),
      when: e.when,
      then: e.then,
      quote: quote(e.quoteId),
    })),
  }))
}

/** Fallback screen moment: the last screenshot at or before `at`. */
function nearestScreen(runtime: SessionRuntime, at: number, caption: string): ScreenMoment {
  const shots = runtime.events.filter((e) => e.screenshotUrl)
  const shot = [...shots].reverse().find((e) => e.at <= at) ?? shots[0]
  return {
    sessionId: runtime.session.id,
    at: shot?.at ?? at,
    screenshotUrl: shot?.screenshotUrl ?? "",
    caption,
  }
}

/* End of capture → draft workflow with debrief questions ------------- */

export async function finishCapture(sessionId: ID): Promise<WorkMap> {
  const runtime = getRuntime(sessionId)
  const { session } = runtime
  if (runtime.draftWorkMapId) return getWorkMap(runtime.draftWorkMapId)
  session.durationSec = Math.round(sessionAt(runtime))
  session.status = "processing"
  if (store.captureStatus.liveSessionId === sessionId) {
    store.captureStatus = { ...store.captureStatus, active: false, offTheRecord: false }
  }
  // Steps keep their candidate's screen moment, so wait until its focus box is in.
  await Promise.all(runtime.pendingFocus)

  const expert = session.expert
  const pool: QuotePool = new Map()
  runtime.events
    .filter((e) => e.kind === "speech")
    .forEach((e, i) => {
      const question = runtime.questions.find((q) => q.id === e.questionId)
      pool.set(`u${i + 1}`, {
        text: e.text,
        speaker: expert,
        source: question ? "live_question" : "narration",
        prompt: question?.question,
        at: e.at,
      })
    })

  const base = session.basedOnWorkMapId ? getWorkMap(session.basedOnWorkMapId) : undefined
  const timeline = runtime.events
    .filter((e) => e.kind !== "speech")
    .map((e) => `  ${e.at.toFixed(0)}s ${e.kind}${e.important ? " (important)" : ""}: ${e.text}`)
  const candidates = runtime.candidates.map(
    (c) =>
      `  [${c.id}] ${c.at.toFixed(0)}s ${c.kind}: ${c.title} — ${c.decision}` +
      (c.deviation ? " (DEVIATES from the saved workflow)" : ""),
  )
  const open = runtime.questions
    .filter((q) => !q.answer)
    .map((q) => `  ${q.askedLive ? "asked live, no answer" : "not asked yet"}: ${q.question}`)

  const draft = await structured({
    model: models.reasoning,
    effort: "medium",
    system: prompt("workmap-draft"),
    language: runtime.language,
    schema: DraftOut,
    content: [
      text(
        [
          `Task: ${session.task}`,
          `Expert: ${expert.name}, ${expert.role}`,
          memoryContext(base),
          `Candidate steps (ids usable as fromId):\n${candidates.join("\n") || "  (none)"}`,
          `Screen and question timeline:\n${timeline.join("\n") || "  (none)"}`,
          `What the expert said (quote ids):\n${poolText(pool) || "  (nothing)"}`,
          `Open questions:\n${open.join("\n") || "  (none)"}`,
        ].join("\n\n"),
      ),
    ],
  })

  const steps = toSteps(
    draft.steps,
    pool,
    (fromId, i) =>
      runtime.candidates.find((c) => c.id === fromId)?.screen ??
      nearestScreen(runtime, runtime.candidates[i]?.at ?? sessionAt(runtime), draft.steps[i].title),
    () => newId("s"),
  )
  const map: WorkMap = {
    id: newId("wm"),
    title: draft.title,
    summary: draft.summary,
    domain: draft.domain,
    trigger: draft.trigger,
    expert,
    status: "in_debrief",
    updatedAt: new Date().toISOString(),
    sessionIds: [session.id],
    language: runtime.language ?? "en",
    steps,
    debrief: draft.debriefQuestions.map((q) => ({
      id: newId("d"),
      question: q.question,
      resolved: false,
      stepId: q.stepIndex != null ? steps[q.stepIndex]?.id : undefined,
    })),
  }
  saveWorkMap(map)
  runtime.draftWorkMapId = map.id
  session.workMapId = map.id
  session.status = "awaiting_debrief"
  return map
}

/* Debrief ------------------------------------------------------------ */

function draftContext(map: WorkMap) {
  const steps = map.steps.map(
    (s, i) =>
      `  ${i + 1}. [${s.id}] (${s.kind}) ${s.title} — ${s.decision}` +
      (s.reason ? `\n     why: "${s.reason.text}"` : "") +
      s.guardrails.map((g) => `\n     guardrail (${g.kind}): ${g.rule}`).join("") +
      s.edgeCases.map((e) => `\n     edge case: if ${e.when} → ${e.then}`).join(""),
  )
  const debrief = map.debrief.map(
    (d) => `  Q: ${d.question}\n  A: ${d.answer ? `"${d.answer.text}"` : "(not answered)"}`,
  )
  const corrections = map.teachBack?.corrections.map((c) => `  "${c.text}"`) ?? []
  return [
    `Workflow "${map.title}" — ${map.summary}`,
    `When: ${map.trigger}`,
    `Steps:\n${steps.join("\n")}`,
    `Debrief:\n${debrief.join("\n") || "  (none)"}`,
    corrections.length ? `Corrections from the expert:\n${corrections.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function answerDebrief(workMapId: ID, itemId: ID, answer: DebriefAnswer): WorkMap {
  const map = getWorkMap(workMapId)
  const item = map.debrief.find((d) => d.id === itemId)
  if (!item) throw new HttpError(404, `Debrief question ${itemId} not found`)
  if (!answer.text.trim()) throw new HttpError(400, "Answer is empty")
  item.answer = {
    text: answer.text.trim(),
    speaker: map.expert,
    source: "debrief",
    prompt: item.question,
    at: answer.at,
  }
  item.resolved = true
  map.updatedAt = new Date().toISOString()
  return map
}

const TeachBackOut = z.object({ summary: z.string() })

/** The language the expert recorded this workflow in (their profile at the time). */
const sessionLanguage = (map: WorkMap) =>
  map.sessionIds.map((id) => store.sessions.get(id)?.language).find(Boolean)

export async function requestTeachBack(workMapId: ID): Promise<WorkMap> {
  const map = getWorkMap(workMapId)
  const { summary } = await structured({
    model: models.reasoning,
    effort: "low",
    maxTokens: 4000,
    system: prompt("teach-back", { expert: map.expert.name }),
    language: sessionLanguage(map),
    schema: TeachBackOut,
    content: [text(draftContext(map))],
  })
  map.teachBack = {
    summary,
    confirmed: false,
    corrections: map.teachBack?.corrections ?? [],
  }
  map.updatedAt = new Date().toISOString()
  return map
}

export async function replyTeachBack(workMapId: ID, reply: TeachBackReply): Promise<WorkMap> {
  const map = getWorkMap(workMapId)
  if (!map.teachBack) throw new HttpError(409, "Request a teach-back first")
  if (reply.correction?.trim()) {
    map.teachBack.corrections.push({
      text: reply.correction.trim(),
      speaker: map.expert,
      source: "debrief",
      prompt: "Did I get that right?",
      at: reply.at,
    })
  }
  if (!reply.confirmed) {
    // Explain it back again with the correction folded in, until the expert confirms.
    return requestTeachBack(workMapId)
  }
  map.teachBack.confirmed = true
  return finalize(map)
}

/* Merge into memory -------------------------------------------------- */

async function finalize(draft: WorkMap): Promise<WorkMap> {
  const unresolved = draft.debrief.filter((d) => !d.resolved)
  if (unresolved.length > 0) {
    // "Understood" means: every open question resolved AND the teach-back confirmed.
    draft.status = "in_debrief"
    return draft
  }

  const base = store.workMaps.find(
    (m) =>
      m.id !== draft.id &&
      draft.sessionIds.some((sid) => store.sessions.get(sid)?.session.basedOnWorkMapId === m.id),
  )

  // Every quote either map already holds, plus debrief answers and corrections.
  const pool: QuotePool = new Map()
  const screens = new Map<string, ScreenMoment>()
  const add = (q: Quote | undefined) => {
    if (!q) return
    if ([...pool.values()].some((p) => p.text === q.text && p.at === q.at)) return
    pool.set(`q${pool.size + 1}`, q)
  }
  for (const map of [base, draft]) {
    for (const s of map?.steps ?? []) {
      screens.set(s.id, s.screen)
      add(s.reason)
      s.guardrails.forEach((g) => add(g.quote))
      s.edgeCases.forEach((e) => add(e.quote))
    }
  }
  draft.debrief.forEach((d) => add(d.answer))
  draft.teachBack?.corrections.forEach(add)

  const merged = await structured({
    model: models.reasoning,
    effort: "medium",
    system: prompt("workmap-finalize"),
    language: sessionLanguage(draft),
    schema: MapOut,
    content: [
      text(
        [
          base
            ? `SAVED workflow (update this one):\n${draftContext(base)}`
            : "No saved workflow; this is a new one.",
          `NEW session (draft, debrief and corrections):\n${draftContext(draft)}`,
          `Quotes (ids usable as reasonQuoteId / quoteId):\n${poolText(pool)}`,
        ].join("\n\n"),
      ),
    ],
  })

  const target = base ?? draft
  const fallbackScreen = target.steps[0]?.screen ?? draft.steps[0]?.screen
  const steps = toSteps(
    merged.steps,
    pool,
    (fromId) => (fromId && screens.get(fromId)) || fallbackScreen,
    (fromId) => (fromId && screens.has(fromId) ? fromId : newId("s")),
  )
  const result: WorkMap = {
    ...target,
    title: merged.title,
    summary: merged.summary,
    domain: merged.domain,
    trigger: merged.trigger,
    expert: (base?.expert ?? draft.expert) as Person,
    status: "confirmed",
    updatedAt: new Date().toISOString(),
    sessionIds: [...new Set([...(base?.sessionIds ?? []), ...draft.sessionIds])],
    steps,
    debrief: [...(base?.debrief ?? []), ...draft.debrief],
    teachBack: draft.teachBack,
    // finalize writes in the recording expert's language.
    language: sessionLanguage(draft) ?? target.language,
  }
  saveWorkMap(result)
  // Ready in every language someone reads before anyone opens it.
  void prepareWorkMap(result)
  if (base) {
    // The session's draft was merged into the saved map instead of becoming a duplicate.
    store.workMaps = store.workMaps.filter((m) => m.id !== draft.id)
  }
  for (const sid of draft.sessionIds) {
    const runtime = store.sessions.get(sid)
    if (runtime) {
      runtime.session.status = "mapped"
      runtime.session.workMapId = result.id
    }
  }
  return result
}
