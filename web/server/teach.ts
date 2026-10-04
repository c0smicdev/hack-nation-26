import { z } from "zod"

import type {
  AskRequest,
  AskResponse,
  DecisionCheck,
  DecisionVerdict,
  ID,
  VoiceRole,
  VoiceSession,
  WorkflowDraft,
  WorkflowDraftRequest,
} from "../src/lib/api/types.js"
import { memoryContext } from "./capture.js"
import { models, prompt, structured, text } from "./llm.js"
import { getWorkMap, HttpError, store } from "./store.js"

/* Save gate: the mock ERP holds a save until the tutor allows it ----- */

const VerdictOut = z.object({
  allow: z.boolean(),
  message: z.string(),
  stepId: z.string().nullable(),
  guardrailId: z.string().nullable(),
})

export async function checkDecision(workMapId: ID, check: DecisionCheck): Promise<DecisionVerdict> {
  const map = getWorkMap(workMapId)
  const guardrailIds = map.steps
    .flatMap((s) => s.guardrails.map((g) => `  [${g.id}] in step [${s.id}]: ${g.rule}`))
    .join("\n")
  const verdict = await structured({
    model: models.reasoning,
    effort: "low",
    maxTokens: 4000,
    system: prompt("tutor-check", { expert: map.expert.name }),
    schema: VerdictOut,
    content: [
      text(
        [
          memoryContext(map),
          `Guardrail ids:\n${guardrailIds || "  (none)"}`,
          `The learner wants to: ${check.action}`,
          `Record as it would be saved:\n${JSON.stringify(check.record, null, 2)}`,
        ].join("\n\n"),
      ),
    ],
  })

  const step = map.steps.find((s) => s.id === verdict.stepId)
  const guardrail = map.steps.flatMap((s) => s.guardrails).find((g) => g.id === verdict.guardrailId)
  return {
    allow: verdict.allow,
    message: verdict.message,
    stepId: step?.id,
    guardrailId: guardrail?.id,
    quote: guardrail?.quote ?? step?.reason,
    screen: step?.screen,
  }
}

/* Voice: signed URLs keep the ElevenLabs key on the server ----------- */

const agentEnv: Record<VoiceRole, string> = {
  interviewer: "ELEVENLABS_INTERVIEWER_AGENT_ID",
  tutor: "ELEVENLABS_TUTOR_AGENT_ID",
  drafter: "ELEVENLABS_DRAFTER_AGENT_ID",
}

export async function voiceSession(role: VoiceRole): Promise<VoiceSession | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env[agentEnv[role]]
  // No agent configured → the UI falls back to text.
  if (!apiKey || !agentId) return null
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey } },
  )
  if (!res.ok) throw new HttpError(502, `ElevenLabs: ${res.status} ${await res.text()}`)
  const { signed_url } = (await res.json()) as { signed_url: string }
  return { signedUrl: signed_url }
}

/* Ask: Q&A over confirmed workflows ---------------------------------- */

const AskOut = z.object({
  answer: z.string(),
  citations: z.array(z.object({ workMapId: z.string(), stepId: z.string() })),
})

export async function ask({ question, workMapId }: AskRequest): Promise<AskResponse> {
  const scope = workMapId ? [getWorkMap(workMapId)] : store.workMaps
  const catalog = scope.map((m) => `[map ${m.id}]\n${memoryContext(m)}`).join("\n\n")
  const out = await structured({
    model: models.reasoning,
    effort: "low",
    maxTokens: 4000,
    system: prompt("ask"),
    schema: AskOut,
    content: [text(`${catalog}\n\nQuestion from a new employee: ${question}`)],
  })
  const citations = out.citations.flatMap(({ workMapId, stepId }) => {
    const map = scope.find((m) => m.id === workMapId)
    const step = map?.steps.find((s) => s.id === stepId)
    return map && step
      ? [{ workMapId, workMapTitle: map.title, stepId, stepTitle: step.title }]
      : []
  })
  return { answer: out.answer, citations }
}

/* New workflow: title + description drafted from a typed chat -------- */

const DraftOut = z.object({
  reply: z.string(),
  title: z.string(),
  description: z.string(),
  ready: z.boolean(),
})

export async function draftWorkflow({
  messages,
  title,
  description,
}: WorkflowDraftRequest): Promise<WorkflowDraft> {
  const chat = messages
    .map((m) => `${m.role === "user" ? "Expert" : "Socrates"}: ${m.content}`)
    .join("\n")
  return structured({
    model: models.reasoning,
    effort: "low",
    maxTokens: 2000,
    system: prompt("workflow-draft"),
    schema: DraftOut,
    content: [
      text(
        `Current title: ${title || "(empty)"}\nCurrent description: ${description || "(empty)"}\n\nConversation:\n${chat}`,
      ),
    ],
  })
}
