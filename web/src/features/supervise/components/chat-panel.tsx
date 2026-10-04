import { BookOpen, Loader2, Send, ShieldAlert } from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ID, SupervisorWarning, WorkMap } from "@/lib/api"
import { cn } from "@/lib/utils"

import { ExpertQuote } from "./mentor-steps"

export type ChatItem =
  | { kind: "user"; id: string; at: number; text: string }
  | { kind: "agent"; id: string; at: number; text: string; stepIds?: ID[] }
  | { kind: "warning"; id: string; at: number; warning: SupervisorWarning }
  /** The agent pointed at a step of the Work Map (show_step). */
  | { kind: "step"; id: string; at: number; stepId: ID }

/**
 * The learner's questions (spoken and transcribed, or typed) and Socrates'
 * answers, with heads-ups in between. Steps link to "What the mentor did".
 */
export function ChatPanel({
  map,
  items,
  thinking,
  canSend,
  onSend,
  onOpenStep,
}: {
  map: WorkMap
  items: ChatItem[]
  thinking: boolean
  canSend: boolean
  onSend: (text: string) => void
  onOpenStep: (id: ID) => void
}) {
  const [draft, setDraft] = useState("")
  const end = useRef<HTMLDivElement>(null)
  const expertFirst = map.expert.name.split(" ")[0]

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" })
  }, [items.length, thinking])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    onSend(draft.trim())
    setDraft("")
  }

  const stepLink = (stepId: ID) => {
    const index = map.steps.findIndex((s) => s.id === stepId)
    if (index === -1) return null
    return (
      <Button
        key={stepId}
        variant="outline"
        size="sm"
        className="h-auto max-w-full justify-start py-1 text-left text-xs whitespace-normal"
        onClick={() => onOpenStep(stepId)}
      >
        <BookOpen className="size-3.5" /> Step {index + 1}: {map.steps[index].title}
      </Button>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {items.length === 0 && (
          <div className="space-y-2 py-6 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Socrates is standing by</p>
            <p>
              Work as you normally would. Ask anything, out loud or below, and Socrates answers in{" "}
              {expertFirst}'s words. If you're about to make a mistake {expertFirst} would have
              caught, it'll tell you.
            </p>
          </div>
        )}
        {items.map((item) => {
          if (item.kind === "warning") {
            const { warning } = item
            return (
              <div
                key={item.id}
                className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="size-3.5" />
                  {warning.source === "save"
                    ? `${expertFirst} would stop here · save held`
                    : "Heads-up"}
                </p>
                <p>{warning.message}</p>
                {warning.quote && <ExpertQuote quote={warning.quote} />}
                {warning.stepId && stepLink(warning.stepId)}
              </div>
            )
          }
          if (item.kind === "step") {
            return (
              <div key={item.id} className="flex">
                {stepLink(item.stepId)}
              </div>
            )
          }
          return (
            <div
              key={item.id}
              className={cn(
                "space-y-2 rounded-lg px-3 py-2",
                item.kind === "agent" ? "mr-6 bg-primary/5" : "ml-6 bg-muted",
              )}
            >
              <span className="block text-xs font-medium text-muted-foreground">
                {item.kind === "agent" ? "Socrates" : "You"}
              </span>
              <p>{item.text}</p>
              {item.kind === "agent" && item.stepIds && item.stepIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">{item.stepIds.map(stepLink)}</div>
              )}
            </div>
          )
        })}
        {thinking && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Socrates is looking it up…
          </p>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t px-4 py-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={canSend ? "Ask Socrates…" : "Share your screen to start"}
          disabled={!canSend}
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          aria-label="Send"
          disabled={!canSend || !draft.trim()}
        >
          <Send />
        </Button>
      </form>
    </div>
  )
}
