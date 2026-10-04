import type { WorkMap, WorkMapSummary } from "./types"

/** Shared by the mock and the real backend so list cards always count the same way. */
export function toSummary(map: WorkMap): WorkMapSummary {
  return {
    id: map.id,
    title: map.title,
    summary: map.summary,
    domain: map.domain,
    expert: map.expert,
    status: map.status,
    updatedAt: map.updatedAt,
    stepCount: map.steps.length,
    judgmentCount: map.steps.filter((s) => s.kind === "judgment").length,
    guardrailCount: map.steps.reduce((n, s) => n + s.guardrails.length, 0),
    openQuestionCount: map.debrief.filter((d) => !d.resolved).length,
    cover: map.steps[0]?.screen,
    ...(map.translationPending && { translationPending: true }),
  }
}
