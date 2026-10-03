/**
 * Creates or updates the two ElevenAgents (interviewer + tutor) from
 * prompts/*.md, so agent config lives in git, not in a dashboard.
 *
 *   npm run setup:agents
 *
 * Reads ELEVENLABS_API_KEY from .env.local and writes the agent ids back into it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const ENV_FILE = ".env.local"
const API = "https://api.elevenlabs.io/v1/convai"
/** Claude via ElevenAgents' built-in LLM catalog (see GET /v1/convai/llm/list). */
const LLM = process.env.ELEVENLABS_LLM ?? "claude-sonnet-5-5"

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {}
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^\w+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  )
}

function writeEnv(key: string, value: string) {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : ""
  const line = `${key}=${value}`
  const next = new RegExp(`^${key}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${text.trimEnd()}\n${line}\n`
  writeFileSync(ENV_FILE, next)
}

type Prop = { type: "string" | "boolean"; description: string }

/** Client tools run in the browser (useConversation clientTools); the agent waits for their result. */
function clientTool(
  name: string,
  description: string,
  properties: Record<string, Prop> = {},
  timeoutSecs = 20,
) {
  return {
    type: "client",
    name,
    description,
    expects_response: true,
    response_timeout_secs: timeoutSecs,
    parameters: { type: "object", properties, required: Object.keys(properties) },
  }
}

const skipTurn = {
  skip_turn: {
    type: "system",
    name: "skip_turn",
    description:
      "Stay silent and let the expert keep working. Use whenever they narrate or think out loud without addressing you.",
    params: { system_tool_type: "skip_turn" },
  },
}

const agents = {
  interviewer: {
    envKey: "ELEVENLABS_INTERVIEWER_AGENT_ID",
    name: "Socrates · Interviewer",
    prompt: "interviewer",
    firstMessage:
      "I'm watching. Go ahead whenever you're ready; I'll mostly listen and ask a few things along the way.",
    placeholders: { expert_name: "Sabine", task: "Process supplier invoices" },
    // Experts pause to think while they work: don't jump in.
    turn: { turn_eagerness: "patient", turn_timeout: 15 },
    tools: [
      clientTool(
        "lookup_memory",
        "Find saved Work Maps for this task, so you don't document a workflow twice.",
        {
          task: { type: "string", description: "One-line description of the task" },
        },
      ),
      clientTool("set_base_work_map", "Record whether this session extends a saved Work Map.", {
        work_map_id: {
          type: "string",
          description: "Id of the saved Work Map, or 'none' if the task is new",
        },
      }),
      clientTool("start_capture", "Start watching the screen once you understand the task.", {
        goal: { type: "string", description: "What the task achieves, one sentence" },
        trigger: { type: "string", description: "When this task comes up, one sentence" },
      }),
      clientTool(
        "set_off_record",
        "Go off the record (nothing is captured) or back on the record.",
        {
          off: {
            type: "boolean",
            description: "true = off the record, false = back on the record",
          },
        },
      ),
      clientTool(
        "finish_task",
        "The expert is done with the task. Ends capture and returns the open questions for the debrief.",
        {},
        120,
      ),
      clientTool("record_debrief_answer", "The expert has answered this debrief question.", {
        question_id: { type: "string", description: "Id of the question that was answered" },
      }),
      clientTool(
        "get_teach_back",
        "Get the explanation of the whole process to read back to the expert.",
        {},
        90,
      ),
      clientTool(
        "reply_teach_back",
        "The expert confirmed or corrected your teach-back.",
        {
          confirmed: { type: "boolean", description: "true if they confirmed it's right" },
          correction: {
            type: "string",
            description: "Their correction in their words, empty if confirmed",
          },
        },
        120,
      ),
    ],
  },
  tutor: {
    envKey: "ELEVENLABS_TUTOR_AGENT_ID",
    name: "Socrates · Tutor",
    prompt: "tutor",
    firstMessage:
      "Hi {{learner_name}}, I'm Socrates. Today we'll work through how {{expert_name}} does this.",
    placeholders: { learner_name: "Alex", expert_name: "Sabine", work_map: "(Work Map)" },
    turn: { turn_eagerness: "normal", turn_timeout: 10 },
    tools: [
      clientTool(
        "finish_lesson",
        "The lesson is over. Show what the learner mastered and what to practice.",
        {
          mastered: {
            type: "string",
            description: "What they got right, short phrases separated by semicolons",
          },
          practice: {
            type: "string",
            description: "What to practice, short phrases separated by semicolons",
          },
        },
      ),
    ],
  },
  drafter: {
    envKey: "ELEVENLABS_DRAFTER_AGENT_ID",
    name: "Socrates · New workflow",
    prompt: "drafter",
    firstMessage:
      "Hi, I'm Socrates. Which workflow do you want to show me? Just tell me what you do and when.",
    placeholders: {},
    turn: { turn_eagerness: "normal", turn_timeout: 10 },
    tools: [
      clientTool(
        "update_workflow",
        "Update the new workflow's title and description on the expert's screen.",
        {
          title: { type: "string", description: "3–7 words, the task as the expert names it" },
          description: {
            type: "string",
            description: "1–3 sentences: what the task is, for whom, and when it comes up",
          },
        },
      ),
      clientTool(
        "create_workflow",
        "The expert agreed: create the workflow and start capture.",
        {},
      ),
    ],
  },
}

async function main() {
  const env = { ...readEnv(), ...process.env }
  const apiKey = env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error(`Set ELEVENLABS_API_KEY in ${ENV_FILE}`)

  for (const [role, agent] of Object.entries(agents)) {
    const body = {
      name: agent.name,
      conversation_config: {
        agent: {
          first_message: agent.firstMessage,
          language: "en",
          dynamic_variables: { dynamic_variable_placeholders: agent.placeholders },
          prompt: {
            prompt: readFileSync(`prompts/${agent.prompt}.md`, "utf8"),
            llm: LLM,
            tools: agent.tools,
          },
        },
        // Scribe v2 Realtime: listening + pause detection.
        asr: { provider: "scribe_realtime", quality: "high" },
        turn: agent.turn,
      },
    }

    const existing = env[agent.envKey]
    const res = await fetch(existing ? `${API}/agents/${existing}` : `${API}/agents/create`, {
      method: existing ? "PATCH" : "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${agent.name}: ${res.status} ${await res.text()}`)
    const { agent_id } = (await res.json()) as { agent_id: string }

    // The API ignores built_in_tools when inline `tools` are in the same request, so set them separately.
    if (role === "interviewer") {
      const patch = await fetch(`${API}/agents/${agent_id}`, {
        method: "PATCH",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_config: { agent: { prompt: { built_in_tools: skipTurn } } },
        }),
      })
      if (!patch.ok)
        throw new Error(`${agent.name} (skip_turn): ${patch.status} ${await patch.text()}`)
    }
    writeEnv(agent.envKey, agent_id)
    console.log(`${existing ? "Updated" : "Created"} ${agent.name}: ${agent_id}`)
  }
  console.log(`Agent ids written to ${ENV_FILE}. Restart \`npm run dev\` to pick them up.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
