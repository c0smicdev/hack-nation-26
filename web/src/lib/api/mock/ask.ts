import type { AskResponse, Citation, WorkMap, WorkMapStep } from "../types"

/** Keyword search over workflow steps: good enough to demo Ask without a model. */

const STOPWORDS = new Set(
  "a an and are be do does for how i if in is it of on or should the this to what when where which who why with you".split(
    " ",
  ),
)
const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9€äöüß]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))

function stepText(step: WorkMapStep) {
  return [
    step.title,
    step.decision,
    step.reason?.text,
    step.screen.caption,
    ...step.guardrails.map((g) => g.rule),
    ...step.edgeCases.flatMap((e) => [e.when, e.then]),
  ].join(" ")
}

export function answer(question: string, scope: WorkMap[]): AskResponse {
  const terms = tokenize(question)
  const ranked = scope
    .flatMap((map) => map.steps.map((step) => ({ map, step })))
    .map((hit) => {
      const words = new Set(tokenize(stepText(hit.step)))
      return { ...hit, score: terms.filter((t) => words.has(t)).length }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    // Only cite runners-up that are nearly as relevant as the best hit.
    .filter((hit, _, all) => hit.score >= all[0].score / 2 + 0.5)
    .slice(0, 2)

  if (ranked.length === 0) {
    const experts = [...new Set(scope.map((m) => m.expert.name))].join(" or ")
    return {
      answer: `I couldn't find that in the recorded workflows yet. I've noted it so ${experts} can be asked in the next debrief.`,
      citations: [],
    }
  }

  const { map, step } = ranked[0]
  const parts = [`${map.expert.name} covers this in “${step.title}”: ${step.decision}`]
  if (step.reason) parts.push(`In their words: “${step.reason.text}”`)
  const rules = step.guardrails.map((g) => g.rule)
  if (rules.length) parts.push(`Watch out: ${rules.join(" ")}`)

  const citations: Citation[] = ranked.map(({ map, step }) => ({
    workMapId: map.id,
    workMapTitle: map.title,
    stepId: step.id,
    stepTitle: step.title,
  }))
  return { answer: parts.join("\n\n"), citations }
}
