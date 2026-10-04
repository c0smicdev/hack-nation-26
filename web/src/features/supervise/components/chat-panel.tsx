import { BookOpen, Loader2, MicOff, Send, ShieldAlert } from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

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
  mute,
  onSend,
  onTyping,
  onOpenStep,
}: {
  map: WorkMap
  items: ChatItem[]
  thinking: boolean
  canSend: boolean
  /** Mic mute toggle, while the voice is live: the learner can type without being overheard. */
  mute?: { muted: boolean; onToggle: () => void }
  onSend: (text: string) => void
  /** The learner is typing (keeps the voice from talking over them). */
  onTyping?: () => void
  onOpenStep: (id: ID) => void
}) {
  const { t } = useTranslation("supervise")
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
        <BookOpen className="size-3.5" />{" "}
        {t("chatPanel.stepLink", { index: index + 1, title: map.steps[index].title })}
      </Button>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {items.length === 0 && (
          <div className="space-y-2 py-6 text-center text-muted-foreground">
            <p className="font-medium text-foreground">{t("chatPanel.emptyTitle")}</p>
            <p>{t("chatPanel.emptyBody", { expert: expertFirst })}</p>
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
                    ? t("chatPanel.saveHeld", { expert: expertFirst })
                    : t("chatPanel.headsUp")}
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
                {item.kind === "agent" ? t("chatPanel.socrates") : t("chatPanel.you")}
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
            <Loader2 className="size-3.5 animate-spin" /> {t("chatPanel.thinking")}
          </p>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t px-4 py-3">
        {mute && (
          <Button
            type="button"
            size="icon"
            variant={mute.muted ? "destructive" : "outline"}
            onClick={mute.onToggle}
            aria-pressed={mute.muted}
            aria-label={mute.muted ? t("chatPanel.unmute") : t("chatPanel.mute")}
            title={mute.muted ? t("chatPanel.unmute") : t("chatPanel.mute")}
          >
            <MicOff />
          </Button>
        )}
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            onTyping?.()
          }}
          placeholder={
            !canSend
              ? t("chatPanel.placeholderShare")
              : mute?.muted
                ? t("chatPanel.placeholderMuted")
                : t("chatPanel.placeholder")
          }
          disabled={!canSend}
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          aria-label={t("chatPanel.send")}
          disabled={!canSend || !draft.trim()}
        >
          <Send />
        </Button>
      </form>
    </div>
  )
}
