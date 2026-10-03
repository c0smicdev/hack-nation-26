import type { Quote } from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

import { QUOTE_SOURCE } from "../labels"

/** The expert's own words, with where and when they said it. */
export function QuoteBlock({ quote, className }: { quote: Quote; className?: string }) {
  return (
    <figure className={cn("space-y-2", className)}>
      {quote.prompt && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Socrates:</span> “{quote.prompt}”
        </p>
      )}
      <blockquote className="border-l-2 border-primary pl-4 text-base leading-relaxed">
        “{quote.text}”
      </blockquote>
      <figcaption className="pl-4 text-xs text-muted-foreground">
        {quote.speaker.name}, {QUOTE_SOURCE[quote.source]} at {formatTimestamp(quote.at)}
      </figcaption>
    </figure>
  )
}
