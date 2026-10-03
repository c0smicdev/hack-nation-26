import { ConversationProvider } from "@elevenlabs/react"
import { ArrowUp, Keyboard, Landmark, Loader2, Mic } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { useNavigate } from "react-router"

import { paths } from "@/app/paths"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { WorkflowDraftMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useVoiceAgent } from "@/lib/voice/use-voice-agent"
import { useCreateSession } from "@/features/capture/hooks"

import { useDraftWorkflow } from "../hooks"

const GREETING =
  "Which workflow do you want to show me? Tell me what you do, for whom, and when. I'll fill in the title and description."

export function NewWorkflowDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Mounting the body only while open starts every run clean (and ends the voice session on close).
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl">
        {open && (
          <ConversationProvider>
            <NewWorkflowBody onClose={() => setOpen(false)} />
          </ConversationProvider>
        )}
      </DialogContent>
    </Dialog>
  )
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Briefly highlights a field after Socrates changed it. */
function useFlash() {
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return [
    on,
    () => {
      setOn(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setOn(false), 1200)
    },
  ] as const
}

function NewWorkflowBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const draft = useDraftWorkflow()
  const create = useCreateSession()

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [titleFlash, flashTitle] = useFlash()
  const [descFlash, flashDesc] = useFlash()
  // Voice first; text only when the user picks it (or voice isn't available).
  const [typing, setTyping] = useState(false)
  const [messages, setMessages] = useState<WorkflowDraftMessage[]>([
    { role: "assistant", content: GREETING },
  ])

  // Latest field values, also written synchronously by `apply`, so a create right
  // after an update (same agent turn / same draft response) uses the new values.
  const fieldsRef = useRef({ title, description })
  useEffect(() => {
    fieldsRef.current = { title, description }
  })

  function apply(next: { title?: string; description?: string }) {
    const cur = fieldsRef.current
    if (next.title?.trim() && next.title !== cur.title) {
      cur.title = next.title.trim()
      setTitle(cur.title)
      flashTitle()
    }
    if (next.description?.trim() && next.description !== cur.description) {
      cur.description = next.description.trim()
      setDescription(cur.description)
      flashDesc()
    }
  }

  const creating = useRef(false)
  async function createWorkflow() {
    if (creating.current) return
    creating.current = true
    const { title, description } = fieldsRef.current
    const session = await create
      .mutateAsync({
        title: title.trim() || "Untitled",
        task: description.trim() || title.trim() || "Untitled",
        expertName: "You",
        expertRole: "Expert",
      })
      .finally(() => (creating.current = false))
    onClose()
    navigate(paths.session(session.id))
  }

  const agent = useVoiceAgent({
    role: "drafter",
    tools: {
      update_workflow: (p) => {
        apply({ title: String(p.title ?? ""), description: String(p.description ?? "") })
        return "Updated. The expert sees the new title and description."
      },
      create_workflow: async () => {
        // Let Socrates finish its "let's start" line before the dialog closes.
        for (let i = 0; i < 20 && agentRef.current.agentSpeaking; i++) await wait(200)
        await createWorkflow()
        return "Created. Capture is starting."
      },
    },
  })
  const voiceDown = agent.mode === "text" || agent.mode === "error"
  const textMode = typing || voiceDown

  // Start talking right away. Deferred so StrictMode's mount/unmount/mount starts only once.
  const agentRef = useRef(agent)
  useEffect(() => {
    agentRef.current = agent
  })
  useEffect(() => {
    if (typing) return
    const t = setTimeout(() => void agentRef.current.start({}), 0)
    return () => {
      clearTimeout(t)
      agentRef.current.stop()
    }
  }, [typing])

  // Coming back to voice after typing or editing: tell the new conversation where we are.
  const connected = agent.mode === "voice"
  useEffect(() => {
    const { title, description } = fieldsRef.current
    if (connected && (title || description)) {
      agentRef.current.context(`[EDIT] title: ${title} description: ${description}`)
    }
  }, [connected])

  /** Hand edits go to the agent so it builds on them instead of overwriting. */
  function editedByHand() {
    if (connected) agent.context(`[EDIT] title: ${title} description: ${description}`)
  }

  function switchToText() {
    const said = agent.transcript.flatMap((l): WorkflowDraftMessage[] =>
      l.role === "app" ? [] : [{ role: l.role === "user" ? "user" : "assistant", content: l.text }],
    )
    if (said.length) setMessages(said)
    setTyping(true)
  }

  function send(text: string) {
    text = text.trim()
    if (!text || draft.isPending) return
    const next: WorkflowDraftMessage[] = [...messages, { role: "user", content: text }]
    setMessages(next)
    draft.mutate(
      { messages: next, title, description },
      {
        onSuccess: (res) => {
          apply(res)
          setMessages((m) => [...m, { role: "assistant", content: res.reply }])
          // A failed create leaves the dialog open; the button still works.
          if (res.ready) createWorkflow().catch(() => undefined)
        },
        onError: (e) =>
          setMessages((m) => [
            ...m,
            { role: "assistant", content: `Sorry, I couldn't draft that: ${e.message}` },
          ]),
      },
    )
  }

  return (
    <div className="flex max-h-[85vh] flex-col">
      {/* The workflow, filled in live from the conversation */}
      <div className="space-y-1 px-6 pt-6 pb-4">
        <DialogTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          New workflow
        </DialogTitle>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={editedByHand}
          placeholder="Untitled workflow"
          aria-label="Title"
          className={cn(
            "-mx-2 w-[calc(100%+1rem)] rounded-md bg-transparent px-2 py-1 text-2xl font-semibold transition-colors outline-none placeholder:text-muted-foreground/50 focus-visible:bg-muted/50",
            titleFlash && "bg-primary/10",
          )}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={editedByHand}
          placeholder={
            textMode
              ? "Socrates fills this in as you describe the workflow…"
              : "Socrates fills this in as you talk…"
          }
          aria-label="Description"
          rows={2}
          className={cn(
            "-mx-2 field-sizing-content max-h-40 min-h-12 w-[calc(100%+1rem)] resize-none rounded-md bg-transparent px-2 py-1 text-sm leading-relaxed text-muted-foreground transition-colors outline-none placeholder:text-muted-foreground/50 focus-visible:bg-muted/50 focus-visible:text-foreground",
            descFlash && "bg-primary/10 text-foreground",
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t bg-muted/30">
        {textMode ? (
          <TextChat
            messages={messages}
            pending={draft.isPending}
            onSend={send}
            notice={
              voiceDown && !typing
                ? (agent.error ?? "Voice isn't available here, so let's type.")
                : undefined
            }
          />
        ) : (
          <VoiceStage agent={agent} />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-6 py-4">
        {textMode ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTyping(false)}
            disabled={voiceDown && !typing}
          >
            <Mic /> Talk instead
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={switchToText}>
            <Keyboard /> Type instead
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={createWorkflow} disabled={create.isPending || !title.trim()}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Create workflow
          </Button>
        </div>
      </div>
    </div>
  )
}

function VoiceStage({ agent }: { agent: ReturnType<typeof useVoiceAgent> }) {
  const lastAgent = agent.transcript.findLast((l) => l.role === "agent")
  const lastUser = agent.transcript.findLast((l) => l.role === "user")
  const live = agent.mode === "voice"
  const status = !live
    ? "Connecting…"
    : agent.agentSpeaking
      ? "Socrates is speaking"
      : "Listening — just talk"

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
      <div className="relative flex size-20 items-center justify-center">
        {live && (
          <span
            className={cn(
              "absolute inset-0 rounded-full bg-primary/20",
              agent.agentSpeaking ? "animate-pulse" : "animate-ping [animation-duration:2s]",
            )}
          />
        )}
        <div
          className={cn(
            "relative flex size-16 items-center justify-center rounded-full shadow-sm transition-colors",
            live ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {!live ? (
            <Loader2 className="size-6 animate-spin" />
          ) : agent.agentSpeaking ? (
            <Landmark className="size-6" />
          ) : (
            <Mic className="size-6" />
          )}
        </div>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{status}</p>
      <div className="min-h-16 max-w-md space-y-2">
        {lastAgent && <p className="text-sm leading-relaxed">{lastAgent.text}</p>}
        {lastUser && lastUser.at > (lastAgent?.at ?? 0) && (
          <p className="text-sm text-muted-foreground italic">“{lastUser.text}”</p>
        )}
      </div>
    </div>
  )
}

function TextChat({
  messages,
  pending,
  onSend,
  notice,
}: {
  messages: WorkflowDraftMessage[]
  pending: boolean
  onSend: (text: string) => void
  notice?: string
}) {
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, pending])

  function submit() {
    if (!input.trim() || pending) return
    onSend(input)
    setInput("")
  }

  return (
    <>
      <div className="max-h-72 min-h-40 flex-1 space-y-4 overflow-y-auto p-4">
        {notice && <p className="text-center text-xs text-muted-foreground">{notice}</p>}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              {m.content}
            </p>
          ) : (
            <div key={i} className="flex gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background">
                <Landmark className="size-3.5" />
              </div>
              <p className="min-w-0 pt-1 text-sm leading-relaxed whitespace-pre-line">
                {m.content}
              </p>
            </div>
          ),
        )}
        {pending && <Loader2 className="ml-9 size-4 animate-spin text-muted-foreground" />}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          submit()
        }}
        className="relative border-t p-4"
      >
        <Textarea
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="e.g. I review supplier invoices before the month-end close…"
          rows={2}
          className="resize-none bg-background pr-12"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={!input.trim() || pending}
          className="absolute right-6 bottom-6"
          aria-label="Send"
        >
          <ArrowUp />
        </Button>
      </form>
    </>
  )
}
