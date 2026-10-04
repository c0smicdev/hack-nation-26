import { useTranslation } from "react-i18next"

import type { Quote } from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

import { quoteSourceLabel } from "../labels"

/** The expert's own words, with where and when they said it. */
export function QuoteBlock({ quote, className }: { quote: Quote; className?: string }) {
  const { t } = useTranslation("workMaps")
  return (
    <figure className={cn("space-y-2", className)}>
      {quote.prompt && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("quoteBlock.socrates")}</span>{" "}
          {t("quoted", { text: quote.prompt })}
        </p>
      )}
      <blockquote className="border-l-2 border-primary pl-4 text-base leading-relaxed">
        {t("quoted", { text: quote.text })}
      </blockquote>
      {quote.original && (
        <p className="pl-4 text-sm text-muted-foreground italic">
          {t("quoteBlock.original", { text: quote.original })}
        </p>
      )}
      <figcaption className="pl-4 text-xs text-muted-foreground">
        {t("quoteBlock.caption", {
          speaker: quote.speaker.name,
          source: quoteSourceLabel(quote.source),
          time: formatTimestamp(quote.at),
        })}
      </figcaption>
    </figure>
  )
}
