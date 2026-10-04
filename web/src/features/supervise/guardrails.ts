import type { WorkMap } from "@/lib/api"

/** Lowercase words, with digit groups joined so "€5,000", "5.000" and "5000" all match. */
function words(text: string) {
  return text
    .toLowerCase()
    .replace(/(\d)[.,'\s](?=\d{3}\b)/g, "$1")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
}

/**
 * The expert's guardrails and edge cases that fit a topic ("capex", "Czech subsidiary",
 * "invoice over 5000"), for the supervisor's lookup_guardrail tool. Each comes with its step id
 * and the expert's own words, so the agent can quote them and call show_step. With no match it
 * returns every guardrail: a workflow only has a handful, and "none" would invite the agent to
 * guess.
 */
export function lookupGuardrails(map: WorkMap, topic: string) {
  const query = new Set(words(topic))
  const rules = map.steps.flatMap((step) => [
    ...step.guardrails.map((g) => ({
      stepId: step.id,
      line: `Guardrail (${g.kind}): ${g.rule}${g.escalateTo ? ` Ask: ${g.escalateTo}.` : ""}`,
      quote: g.quote?.text,
      text: `${g.rule} ${g.escalateTo ?? ""} ${g.quote?.text ?? ""}`,
      step,
    })),
    ...step.edgeCases.map((e) => ({
      stepId: step.id,
      line: `Edge case: if ${e.when}, then ${e.then}`,
      quote: e.quote?.text,
      text: `${e.when} ${e.then} ${e.quote?.text ?? ""}`,
      step,
    })),
  ])
  if (!rules.length) return `${map.title} has no guardrails or edge cases.`

  const docs = rules.map((r) => ({
    own: new Set(words(r.text)),
    step: new Set(words(`${r.step.title} ${r.step.decision}`)),
  }))
  // Words in most rules ("invoice") say nothing about which rule is meant: drop them.
  const terms = [...query].filter(
    (w) => docs.filter((d) => d.own.has(w) || d.step.has(w)).length <= rules.length / 2,
  )
  const scored = rules
    .map((r, i) => ({
      ...r,
      // Hits in the rule itself count double the step's title and decision.
      score: terms.reduce(
        (sum, w) => sum + (docs[i].own.has(w) ? 2 : 0) + (docs[i].step.has(w) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)
  const matches = scored.filter((r) => r.score > 0).slice(0, 4)
  const guardrails = scored.filter((r) => r.line.startsWith("Guardrail"))
  const found = matches.length ? matches : guardrails.length ? guardrails : scored

  const lines = found.map(
    (r) =>
      `[${r.stepId}] ${r.step.title}. ${r.line}${r.quote ? ` ${map.expert.name} said: "${r.quote}"` : ""}`,
  )
  return [
    matches.length
      ? `${map.expert.name}'s rules for "${topic}":`
      : `Nothing in ${map.title} mentions "${topic}". All of ${map.expert.name}'s rules:`,
    ...lines,
  ].join("\n")
}
