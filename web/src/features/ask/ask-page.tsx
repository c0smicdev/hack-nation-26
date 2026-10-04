import { useTranslation } from "react-i18next"

import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"

import { AskPanel } from "./ask-panel"

export function AskPage() {
  const { t } = useTranslation("ask")
  // Same examples as the header's Ask panel, so they share the common text.
  const suggestions = [
    t("common:askSuggestions.capex"),
    t("common:askSuggestions.unknownSupplier"),
    t("common:askSuggestions.intercompany"),
  ]
  return (
    <div className="mx-auto flex h-[calc(100svh-7rem)] max-w-3xl flex-col gap-6 md:h-[calc(100svh-9rem)]">
      <PageHeader title={t("askPage.title")} description={t("askPage.description")} />
      <Card className="min-h-0 flex-1 px-4">
        <AskPanel suggestions={suggestions} className="h-full" />
      </Card>
    </div>
  )
}
