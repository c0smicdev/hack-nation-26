import { ArrowUp, Landmark, Loader2 } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

import { paths } from "@/app/paths"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { AskResponse, ID } from "@/lib/api"
import { cn } from "@/lib/utils"

import { useAsk } from "./hooks"

type Turn = { id: number; question: string; response?: AskResponse; error?: string }

/**
 * Text Q&A over the workflows. The ElevenLabs voice agent can reuse the same
 * `api.ask` endpoint (or replace this panel) without touching the pages.
 */
export function AskPanel({
  workMapId,
  suggestions = [],
  className,
}: {
  /** Limit answers to one workflow. */
  workMapId?: ID
  suggestions?: string[]
  className?: string
}) {
  const { t } = useTranslation("ask")
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState("")
  const ask = useAsk()
  const bottomRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [turns])

  function submit(question: string) {
    question = question.trim()
    if (!question || ask.isPending) return
    const id = nextId.current++
    setTurns((prev) => [...prev, { id, question }])
    setDraft("")
    ask.mutate(
      { question, workMapId },
      {
        onSuccess: (response) =>
          setTurns((prev) => prev.map((x) => (x.id === id ? { ...x, response } : x))),
        onError: (e) =>
          setTurns((prev) => prev.map((x) => (x.id === id ? { ...x, error: e.message } : x))),
      },
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    submit(draft)
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto">
        {turns.length === 0 && suggestions.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">{t("askPanel.tryAsking")}</p>
            <div className="flex flex-col items-start gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-lg border px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className="space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
              {turn.question}
            </p>
            <div className="flex gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <Landmark className="size-3.5" />
              </div>
              <div className="min-w-0 space-y-2 pt-1 text-sm">
                {turn.error ? (
                  <p className="text-destructive">{turn.error}</p>
                ) : !turn.response ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <p className="leading-relaxed whitespace-pre-line">{turn.response.answer}</p>
                    {turn.response.citations.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {turn.response.citations.map((c) => (
                          <li key={`${c.workMapId}-${c.stepId}`}>
                            <Link
                              to={paths.workMap(c.workMapId, c.stepId)}
                              className="inline-block rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {workMapId ? c.stepTitle : `${c.workMapTitle} → ${c.stepTitle}`}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="relative">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit(draft)
            }
          }}
          placeholder={t("askPanel.placeholder")}
          rows={2}
          className="resize-none pr-12"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={!draft.trim() || ask.isPending}
          className="absolute right-2 bottom-2"
          aria-label={t("askPanel.send")}
        >
          <ArrowUp />
        </Button>
      </form>
    </div>
  )
}
