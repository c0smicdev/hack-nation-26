import { z } from "zod"

import type {
  ID,
  NewSupervision,
  SupervisionSession,
  SupervisionTickResult,
  SupervisorWarning,
  Tick,
  WorkMap,
} from "../src/lib/api/types.js"
import { imageBlock, models, prompt, structured, text } from "./llm.js"
import { getWorkMap, HttpError, newId, store, type SupervisionRuntime } from "./store.js"

/**
 * Supervise: a new hire runs a confirmed Work Map on their own screen. Each tick,
 * the fast vision model works out which step they're on and flags a possible
 * mistake; Opus double-checks a flag before the learner ever hears about it, so
 * Socrates stays quiet unless the expert really would have stepped in.
 */

/** Don't stack heads-ups: at most one per this many seconds. */
const WARNING_GAP_SEC = 15

export function startSupervision(workMapId: ID, input: NewSupervision): SupervisionSession {
  const map = getWorkMap(workMapId)
  if (map.status !== "confirmed") {
    throw new HttpError(409, "Only a confirmed Work Map can be supervised")
  }
  const session: SupervisionSession = {
    id: newId("sup"),
    workMapId,
    learnerName: input.learnerName?.trim() || "New hire",
    startedAt: new Date().toISOString(),
  }
  store.supervisions.set(session.id, {
    session,
    startedAtMs: Date.now(),
    completed: new Set(),
    actions: [],
    warnings: [],
    warned: new Set(),
    ruledOut: new Set(),
    visionBusy: false,
    pendingErp: [],
  })
  return session
}

function getSupervision(id: ID) {
  const runtime = store.supervisions.get(id)
  if (!runtime) throw new HttpError(404, `Supervision ${id} not found`)
  return runtime
}

/** The Work Map with every id spelled out, so the models can point at steps and guardrails. */
function mapContext(map: WorkMap) {
  const steps = map.steps.map((s, i) => {
    const lines = [`[${s.id}] Step ${i + 1} (${s.kind}): ${s.title}. Decision: ${s.decision}`]
    if (s.reason) lines.push(`    why (${map.expert.name}): "${s.reason.text}"`)
    for (const g of s.guardrails) {
      const who = g.escalateTo ? ` (ask ${g.escalateTo})` : ""
      lines.push(`    guardrail [${g.id}] ${g.kind}${who}: ${g.rule}`)
    }
    for (const e of s.edgeCases) lines.push(`    edge case: if ${e.when} → ${e.then}`)
    return lines.join("\n")
  })
  const answered = map.debrief
    .filter((d) => d.answer)
    .map((d) => `  Q: ${d.question}\n  A: "${d.answer!.text}"`)
  return [
    `Work Map "${map.title}" by ${map.expert.name}: ${map.summary}`,
    `When: ${map.trigger}`,
    `Steps:\n${steps.join("\n")}`,
    answered.length ? `From the debrief:\n${answered.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

const Watch = z.object({
  screen: z.string(),
  action: z.string().nullable(),
  currentStepId: z.string().nullable(),
  completedStepIds: z.array(z.string()),
  concern: z
    .object({
      what: z.string(),
      stepId: z.string().nullable(),
      guardrailId: z.string().nullable(),
    })
    .nullable(),
})

const Verdict = z.object({
  mistake: z.boolean(),
  message: z.string(),
  stepId: z.string().nullable(),
  guardrailId: z.string().nullable(),
})

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9€]+/g, " ")
    .trim()

function progress(runtime: SupervisionRuntime, processed: boolean): SupervisionTickResult {
  return {
    processed,
    screen: runtime.lastScreen,
    currentStepId: runtime.currentStepId,
    completedStepIds: [...runtime.completed],
  }
}

export async function processSupervisionTick(
  supervisionId: ID,
  tick: Tick,
): Promise<SupervisionTickResult> {
  const runtime = getSupervision(supervisionId)
  const map = getWorkMap(runtime.session.workMapId)
  runtime.pendingErp.push(...tick.erp)
  if (!tick.image) return progress(runtime, true)
  // One vision call at a time; drop this frame rather than queue it (it would be stale).
  if (runtime.visionBusy) return progress(runtime, false)

  const current = Buffer.from(tick.image, "base64")
  const previous = runtime.lastFrame
  const erp = runtime.pendingErp.splice(0)
  runtime.lastFrame = current

  runtime.visionBusy = true
  try {
    const stepIds = new Set(map.steps.map((s) => s.id))
    const step = (id: ID | null | undefined) => map.steps.find((s) => s.id === id)
    const recent = runtime.actions.slice(-12).map((a) => `  ${a.at.toFixed(0)}s ${a.text}`)
    const warned = runtime.warnings.map((w) => `  ${w.at.toFixed(0)}s ${w.message}`)

    const watch = await structured({
      model: models.vision,
      maxTokens: 2000,
      system: prompt("supervise-watch", { expert: map.expert.name }),
      schema: Watch,
      content: [
        text(
          [
            mapContext(map),
            `Learner: ${runtime.session.learnerName}`,
            `Step the learner was on: ${step(runtime.currentStepId)?.title ?? "(not started)"}${runtime.currentStepId ? ` [${runtime.currentStepId}]` : ""}`,
            `Steps done so far: ${[...runtime.completed].join(", ") || "(none)"}`,
            `What the learner did so far:\n${recent.join("\n") || "  (nothing yet)"}`,
            `Heads-ups already given (don't flag these again):\n${warned.join("\n") || "  (none)"}`,
            `Application signals since the previous screenshot:\n${erp.map((s) => `  ${s.at.toFixed(0)}s ${s.kind}: ${s.text}`).join("\n") || "  (none)"}`,
          ].join("\n\n"),
        ),
        ...(previous ? [text("Previous screenshot:"), imageBlock(previous)] : []),
        text(previous ? "Current screenshot:" : "Current screenshot (first of the run):"),
        imageBlock(current),
      ],
    })

    const at = tick.at
    for (const signal of erp) {
      if (signal.kind !== "navigate") runtime.actions.push({ at: signal.at, text: signal.text })
    }
    runtime.lastScreen = watch.screen
    if (watch.currentStepId && stepIds.has(watch.currentStepId)) {
      // A new step (or the next work item's step) may deserve a fresh heads-up.
      if (watch.currentStepId !== runtime.currentStepId) runtime.warned.clear()
      runtime.currentStepId = watch.currentStepId
    }
    for (const id of watch.completedStepIds) if (stepIds.has(id)) runtime.completed.add(id)
    if (watch.action) runtime.actions.push({ at, text: watch.action })

    const result: SupervisionTickResult = {
      ...progress(runtime, true),
      action: watch.action ?? undefined,
    }
    const concern = watch.concern
    if (!concern) return result

    // One heads-up per step until the learner moves on: repeating it would only nag. A concern
    // that was ruled out is only re-checked once the learner has done something new.
    const subject = concern.stepId ?? normalize(concern.what)
    const key = `${subject}|${normalize(watch.screen)}|${runtime.actions.length}`
    const lastWarning = runtime.warnings.at(-1)
    const tooSoon = !!lastWarning && at - lastWarning.at < WARNING_GAP_SEC
    if (tooSoon || runtime.warned.has(subject) || runtime.ruledOut.has(key)) return result

    const verdict = await structured({
      model: models.reasoning,
      effort: "low",
      maxTokens: 4000,
      system: prompt("supervise-verify", { expert: map.expert.name }),
      schema: Verdict,
      content: [
        text(
          [
            mapContext(map),
            `What the learner did so far:\n${runtime.actions
              .slice(-12)
              .map((a) => `  ${a.at.toFixed(0)}s ${a.text}`)
              .join("\n")}`,
            `On screen now: ${watch.screen}`,
            `The watcher's concern: ${concern.what}`,
          ].join("\n\n"),
        ),
        text("The learner's screen now:"),
        imageBlock(current),
      ],
    })
    if (!verdict.mistake) {
      runtime.ruledOut.add(key)
      return result
    }

    const s = step(verdict.stepId) ?? step(concern.stepId)
    const guardrail = map.steps
      .flatMap((x) => x.guardrails)
      .find((g) => g.id === verdict.guardrailId)
    const warning: SupervisorWarning = {
      id: newId("w"),
      at,
      source: "screen",
      message: verdict.message,
      stepId: s?.id,
      guardrailId: guardrail?.id,
      quote: guardrail?.quote ?? s?.reason,
      screen: s?.screen,
    }
    runtime.warnings.push(warning)
    runtime.warned.add(subject)
    if (s) runtime.warned.add(s.id)
    return { ...result, warning }
  } catch (error) {
    // Put the signals back so the next frame still sees them.
    runtime.pendingErp.unshift(...erp)
    throw error
  } finally {
    runtime.visionBusy = false
  }
}
