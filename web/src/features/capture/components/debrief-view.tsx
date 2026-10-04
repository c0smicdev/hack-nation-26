import { CheckCircle2, ChevronRight, ListOrdered, Loader2, MessagesSquare, Mic } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { Link } from "react-router"

import { paths } from "@/app/paths"
import { MermaidDiagram } from "@/components/mermaid-diagram"
import { Button } from "@/components/ui/button"
import { VoicePanel } from "@/components/voice-panel"
import type { CaptureSession, ID, LiveStep, SessionEvent, WorkMap } from "@/lib/api"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { VoiceAgent } from "@/lib/voice/use-voice-agent"
import { liveStepsToMermaid, stepNodeId } from "@/features/work-maps/flowchart"

import { DebriefPanel } from "./debrief-panel"
import { LiveStepList } from "./live-step-list"
import { SessionStatusBadge } from "./session-status-badge"

type Tab = "chat" | "steps"

/**
 * After "End workflow": the same layout as recording, but the right side is the
 * conversation. Socrates asks the open questions by voice, then explains the
 * process back until the expert confirms. Without voice, the questions are a form.
 */
export function DebriefView({
  session,
  map,
  steps,
  events,
  elapsed,
  agent,
  agentStatus,
  busy,
  finalMapId,
  onStartVoice,
  onAnswer,
  onTeachBack,
  onReply,
}: {
  session: CaptureSession
  map?: WorkMap
  steps: LiveStep[]
  events: SessionEvent[]
  elapsed: number
  agent: VoiceAgent
  /** Compact voice status for the header. */
  agentStatus: ReactNode
  busy?: string
  finalMapId?: ID
  onStartVoice: () => void
  onAnswer: (itemId: ID, text: string) => void
  onTeachBack: () => void
  onReply: (confirmed: boolean, correction?: string) => void
}) {
  const [tab, setTab] = useState<Tab>("chat")
  const [openId, setOpenId] = useState<ID>()
  const chart = useMemo(() => liveStepsToMermaid(steps), [steps])
  const clicks = Object.fromEntries(
    steps.map((step, i) => [
      stepNodeId(i),
      () => {
        setOpenId(step.id)
        setTab("steps")
      },
    ]),
  )
  const voice = agent.mode === "voice"
  const answered = map?.debrief.filter((d) => d.resolved).length ?? 0
  const total = map?.debrief.length ?? 0

  return (
    // Full-bleed under the app header: cancel <main>'s padding.
    <div className="-m-4 flex h-[calc(100svh-3.5rem)] flex-col md:-m-8">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 md:px-6">
        <nav className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link to={paths.library()} className="text-muted-foreground hover:text-foreground">
            Workflows
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-semibold">{session.title}</span>
        </nav>
        <span className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <SessionStatusBadge status={session.status} /> {formatTimestamp(elapsed)}
        </span>
        {agentStatus}
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_24rem]">
        {/* Left: the workflow as recorded */}
        <section className="relative min-h-80 overflow-hidden bg-muted/20">
          {session.status === "processing" || !map ? (
            <div className="flex size-full items-center justify-center gap-3 p-8 text-muted-foreground">
              <Loader2 className="animate-spin" /> Building the draft Work Map from what Socrates
              saw and heard…
            </div>
          ) : (
            <MermaidDiagram chart={chart} onNodeClick={clicks} className="size-full p-8" />
          )}
        </section>

        {/* Right: the debrief conversation, or the steps */}
        <aside className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{tab === "chat" ? "Debrief" : "Your steps"}</h2>
              <p className="text-xs text-muted-foreground">
                {finalMapId
                  ? "Confirmed and saved to memory"
                  : map?.teachBack
                    ? "Teach-back: does Socrates get it?"
                    : `${answered} of ${total} questions answered`}
              </p>
            </div>
            <div className="flex rounded-md border p-0.5">
              <TabButton active={tab === "chat"} onClick={() => setTab("chat")} label="Chat">
                <MessagesSquare />
              </TabButton>
              <TabButton active={tab === "steps"} onClick={() => setTab("steps")} label="Steps">
                <ListOrdered />
              </TabButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "steps" ? (
              <LiveStepList
                steps={steps}
                events={events}
                openId={openId}
                onToggle={(id) => setOpenId((open) => (open === id ? undefined : id))}
              />
            ) : voice || agent.mode === "connecting" ? (
              <VoicePanel
                agent={agent}
                title="Socrates · Debrief"
                placeholder="Answer by voice, or type it here…"
                mutable
                className="h-full rounded-none shadow-none ring-0"
              />
            ) : (
              map && (
                <div className="space-y-4 p-4">
                  {!finalMapId && (
                    <Button variant="outline" className="w-full" onClick={onStartVoice}>
                      <Mic /> Debrief by voice
                    </Button>
                  )}
                  <DebriefPanel
                    map={map}
                    busy={busy}
                    finalMapId={finalMapId}
                    onAnswer={onAnswer}
                    onTeachBack={onTeachBack}
                    onReply={onReply}
                  />
                </div>
              )
            )}
          </div>

          {/* Voice drives the debrief; these are the hand controls for its last steps. */}
          {voice && map && (
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              {busy && <span className="mr-auto text-xs text-muted-foreground">{busy}…</span>}
              {finalMapId ? (
                <Button asChild>
                  <Link to={paths.workMap(finalMapId)}>
                    <CheckCircle2 /> Open the Work Map
                  </Link>
                </Button>
              ) : map.teachBack ? (
                <Button onClick={() => onReply(true)} disabled={!!busy}>
                  Yes, that's right
                </Button>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={active}
      onClick={onClick}
      className={cn("h-7 px-2", active && "bg-muted")}
    >
      {children} {label}
    </Button>
  )
}
