import { Keyboard, Loader2, Mic, MicOff, Send } from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { VoiceAgent } from "@/lib/voice/use-voice-agent"

/** The conversation with the ElevenLabs agent: status, transcript, and a typed fallback. */
export function VoicePanel({
  agent,
  title = "Socrates",
  placeholder,
  mutable = false,
  className,
}: {
  agent: VoiceAgent
  title?: string
  placeholder?: string
  /** Show a mic mute toggle in the input bar, so the user can write without being overheard. */
  mutable?: boolean
  className?: string
}) {
  const { t } = useTranslation("common")
  const [draft, setDraft] = useState("")
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" })
  }, [agent.transcript.length])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    agent.type(draft.trim())
    setDraft("")
  }

  const canMute = mutable && agent.mode === "voice"
  const muted = canMute && agent.muted

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {agent.mode === "voice" ? (
            <Mic className={cn("size-4", agent.agentSpeaking && "text-primary")} />
          ) : agent.mode === "connecting" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : agent.mode === "text" ? (
            <Keyboard className="size-4" />
          ) : (
            <MicOff className="size-4 text-muted-foreground" />
          )}
          {title}
        </CardTitle>
        <Badge variant={agent.mode === "voice" ? "secondary" : "outline"}>
          {agent.mode === "voice"
            ? agent.agentSpeaking
              ? t("voicePanel.speaking")
              : muted
                ? t("voicePanel.muted")
                : t("voicePanel.listening")
            : agent.mode === "text"
              ? t("voicePanel.textMode")
              : agent.mode === "connecting"
                ? t("voicePanel.connecting")
                : agent.mode === "error"
                  ? t("voicePanel.voiceError")
                  : t("voicePanel.notConnected")}
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {agent.error && <p className="text-sm text-destructive">{agent.error}</p>}
        <div className="min-h-40 flex-1 space-y-2 overflow-y-auto text-sm">
          {agent.transcript.length === 0 && (
            <p className="text-muted-foreground">{t("voicePanel.empty")}</p>
          )}
          {agent.transcript.map((line) =>
            line.role === "app" ? (
              <p key={line.id} className="font-mono text-xs text-muted-foreground">
                {line.text}
              </p>
            ) : (
              <p
                key={line.id}
                className={cn(
                  "rounded-lg px-3 py-2",
                  line.role === "agent" ? "bg-primary/5" : "ml-6 bg-muted",
                )}
              >
                <span className="block text-xs font-medium text-muted-foreground">
                  {line.role === "agent" ? "Socrates" : t("voicePanel.you")}
                </span>
                {line.text}
              </p>
            ),
          )}
          <div ref={end} />
        </div>
        {(agent.mode === "voice" || agent.mode === "text") && (
          <form onSubmit={submit} className="flex gap-2">
            {canMute && (
              <Button
                type="button"
                size="icon"
                variant={muted ? "destructive" : "outline"}
                onClick={() => agent.setMuted(!muted)}
                aria-pressed={muted}
                aria-label={muted ? t("voicePanel.unmute") : t("voicePanel.mute")}
                title={muted ? t("voicePanel.unmute") : t("voicePanel.mute")}
              >
                <MicOff />
              </Button>
            )}
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                if (canMute) agent.activity()
              }}
              placeholder={
                muted
                  ? t("voicePanel.mutedPlaceholder")
                  : (placeholder ?? t("voicePanel.placeholder"))
              }
            />
            <Button type="submit" size="icon" variant="outline" aria-label={t("voicePanel.send")}>
              <Send />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
