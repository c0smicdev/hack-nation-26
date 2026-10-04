import type { WorkMap } from "@/lib/api"
import { eur, type Invoice, net } from "@/lib/erp/data"

/** The workflow as plain text for the tutor's prompt ({{work_map}}). */
export function workMapBrief(map: WorkMap) {
  const steps = map.steps.map((s, i) => {
    const lines = [`${i + 1}. ${s.title} (${s.kind}). What ${map.expert.name} does: ${s.decision}`]
    if (s.reason) lines.push(`   Why, in their words: "${s.reason.text}"`)
    for (const g of s.guardrails) {
      const who = g.escalateTo ? ` Ask: ${g.escalateTo}.` : ""
      lines.push(
        `   Guardrail (${g.kind}): ${g.rule}${who}${g.quote ? ` They said: "${g.quote.text}"` : ""}`,
      )
    }
    for (const e of s.edgeCases) {
      lines.push(
        `   Edge case: if ${e.when}, then ${e.then}${e.quote ? ` They said: "${e.quote.text}"` : ""}`,
      )
    }
    return lines.join("\n")
  })
  const debrief = map.debrief
    .filter((d) => d.answer)
    .map((d) => `Q: ${d.question}\nA (${map.expert.name}): "${d.answer!.text}"`)
  return [
    `Workflow: ${map.title}. ${map.summary}`,
    `When: ${map.trigger}`,
    `Steps:\n${steps.join("\n")}`,
    debrief.length ? `From the debrief:\n${debrief.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** One line about a case, for the tutor when the learner opens it. */
export function caseLine(invoice: Invoice) {
  return `invoice ${invoice.id} from ${invoice.supplier.name} (${invoice.supplier.city}, ${invoice.supplier.country}${invoice.supplier.intercompany ? ", group company" : ""}): ${invoice.description}, ${eur(net(invoice))} net, dated ${invoice.invoiceDate}`
}
