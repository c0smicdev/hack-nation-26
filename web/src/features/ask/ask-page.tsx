import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"

import { AskPanel } from "./ask-panel"

const SUGGESTIONS = [
  "When is an invoice capex instead of opex?",
  "What do I do with an unknown supplier?",
  "Who approves intercompany invoices?",
]

export function AskPage() {
  return (
    <div className="mx-auto flex h-[calc(100svh-7rem)] max-w-3xl flex-col gap-6 md:h-[calc(100svh-9rem)]">
      <PageHeader
        title="Ask Socrates"
        description="Questions about any captured workflow, answered in the experts' own words — with a link to the exact step."
      />
      <Card className="min-h-0 flex-1 px-4">
        <AskPanel suggestions={SUGGESTIONS} className="h-full" />
      </Card>
    </div>
  )
}
