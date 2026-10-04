import { CheckCircle2, Circle, Loader2, MessageSquareQuote } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { paths } from "@/app/paths"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { ID, WorkMap } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * Debrief: open questions, then the teach-back until the expert confirms.
 * The voice agent drives this through client tools; the buttons do the same by hand.
 */
export function DebriefPanel({
  map,
  busy,
  finalMapId,
  onAnswer,
  onTeachBack,
  onReply,
}: {
  map: WorkMap
  busy?: string
  finalMapId?: ID
  onAnswer: (itemId: ID, text: string) => void
  onTeachBack: () => void
  onReply: (confirmed: boolean, correction?: string) => void
}) {
  const answered = map.debrief.filter((d) => d.resolved).length
  const allAnswered = answered === map.debrief.length
  const teachBack = map.teachBack

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Debrief</CardTitle>
          <CardDescription>
            {answered} of {map.debrief.length} open questions answered. Socrates asks them one at a
            time, then explains the whole process back.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            {map.debrief.map((item) => (
              <DebriefItemRow key={item.id} item={item} map={map} onAnswer={onAnswer} />
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className={cn(!allAnswered && "opacity-60")}>
        <CardHeader>
          <CardTitle>Teach-back</CardTitle>
          <CardDescription>
            Done means every question is answered and {map.expert.name} confirms the explanation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {finalMapId ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-4">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <p className="flex-1 font-medium">Confirmed. The workflow is saved to memory.</p>
              <Button asChild>
                <Link to={paths.workMap(finalMapId)}>Open the workflow</Link>
              </Button>
            </div>
          ) : teachBack ? (
            <TeachBackReplyForm
              summary={teachBack.summary}
              corrections={teachBack.corrections.length}
              busy={!!busy}
              onReply={onReply}
            />
          ) : (
            <Button onClick={onTeachBack} disabled={!allAnswered || !!busy}>
              {busy === "teach-back" && <Loader2 className="animate-spin" />}
              Explain it back
            </Button>
          )}
          {busy && <p className="text-sm text-muted-foreground">{busy}…</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function DebriefItemRow({
  item,
  map,
  onAnswer,
}: {
  item: WorkMap["debrief"][number]
  map: WorkMap
  onAnswer: (itemId: ID, text: string) => void
}) {
  const [draft, setDraft] = useState("")
  const step = map.steps.find((s) => s.id === item.stepId)
  return (
    <li className="flex gap-3">
      {item.resolved ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">{item.question}</p>
        {step && <p className="text-xs text-muted-foreground">About: {step.title}</p>}
        {item.answer ? (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <MessageSquareQuote className="mt-0.5 size-4 shrink-0" />“{item.answer.text}”
          </p>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) onAnswer(item.id, draft.trim())
            }}
          >
            <Textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Answer by voice, or type it here"
              className="min-h-9"
            />
            <Button type="submit" variant="outline" disabled={!draft.trim()}>
              Save
            </Button>
          </form>
        )}
      </div>
    </li>
  )
}

function TeachBackReplyForm({
  summary,
  corrections,
  busy,
  onReply,
}: {
  summary: string
  corrections: number
  busy: boolean
  onReply: (confirmed: boolean, correction?: string) => void
}) {
  const [correction, setCorrection] = useState("")
  return (
    <div className="space-y-3">
      <blockquote className="rounded-lg border-l-4 border-primary bg-muted/40 p-4 text-sm leading-relaxed">
        {summary}
      </blockquote>
      {corrections > 0 && (
        <p className="text-xs text-muted-foreground">
          Updated after {corrections} correction{corrections === 1 ? "" : "s"}.
        </p>
      )}
      <Textarea
        value={correction}
        onChange={(e) => setCorrection(e.target.value)}
        placeholder="Something wrong? Correct it in your own words."
        rows={2}
      />
      <div className="flex gap-2">
        <Button onClick={() => onReply(true)} disabled={busy}>
          Yes, that's right
        </Button>
        <Button
          variant="outline"
          disabled={busy || !correction.trim()}
          onClick={() => {
            onReply(false, correction.trim())
            setCorrection("")
          }}
        >
          Correct it
        </Button>
      </div>
    </div>
  )
}
