import { Keyboard, Loader2, Mic, MicOff, Send } from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"

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
  placeholder = "Type instead of speaking…",
  className,
}: {
  agent: VoiceAgent
  title?: string
  placeholder?: string
  className?: string
}) {
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
              ? "Speaking"
              : "Listening"
            : agent.mode === "text"
              ? "Text mode (no voice agent)"
              : agent.mode === "connecting"
                ? "Connecting…"
                : agent.mode === "error"
                  ? "Voice error"
                  : "Not connected"}
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {agent.error && <p className="text-sm text-destructive">{agent.error}</p>}
        <div className="min-h-40 flex-1 space-y-2 overflow-y-auto text-sm">
          {agent.transcript.length === 0 && (
            <p className="text-muted-foreground">The conversation will appear here.</p>
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
                  {line.role === "agent" ? "Socrates" : "You"}
                </span>
                {line.text}
              </p>
            ),
          )}
          <div ref={end} />
        </div>
        {(agent.mode === "voice" || agent.mode === "text") && (
          <form onSubmit={submit} className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
            />
            <Button type="submit" size="icon" variant="outline" aria-label="Send">
              <Send />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
