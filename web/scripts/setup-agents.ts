/**
 * Creates or updates the ElevenAgents (interviewer, supervisor, drafter) from
 * prompts/*.md and their Procedures from prompts/procedures/<role>/*.md,
 * so agent config lives in git, not in a dashboard.
 *
 *   npm run setup:agents               # all agents
 *   npm run setup:agents -- supervisor # only the named ones
 *
 * Reads ELEVENLABS_API_KEY from .env.local and writes the agent ids back into it.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"

const ENV_FILE = ".env.local"
const API = "https://api.elevenlabs.io/v1/convai"
/** Claude via ElevenAgents' built-in LLM catalog (see GET /v1/convai/llm/list). */
const LLM = process.env.ELEVENLABS_LLM ?? "claude-sonnet-5-5"
/**
 * Expressive mode: Eleven v3 Conversational adapts tone to the conversation and speaks audio tags
 * ("[curious]", "[warm]") the LLM writes. Only v3 models support it; the API silently turns
 * `expressive_mode` off for any other TTS model.
 */
const TTS_MODEL = "eleven_v3_conversational"

type AudioTag = { tag: string; description: string }

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

/* Procedures: one free-form procedure per file ----------------------- */

interface ProcedureSource {
  name: string
  trigger: string
  content: string
}

/**
 * A procedure file is `name:` + `trigger:` frontmatter and a markdown body. The body references
 * tools and other procedures by name (`[tool name="start_capture"]`, `[procedure name="Capture"]`);
 * ids differ per agent, so they're resolved at sync time.
 */
function readProcedures(role: string): ProcedureSource[] {
  const dir = `prompts/procedures/${role}`
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(
        readFileSync(`${dir}/${file}`, "utf8"),
      )
      const meta = Object.fromEntries(
        (match?.[1] ?? "")
          .split(/\r?\n/)
          .map((line) => [
            line.slice(0, line.indexOf(":")).trim(),
            line.slice(line.indexOf(":") + 1).trim(),
          ]),
      )
      if (!match || !meta.name || !meta.trigger)
        throw new Error(`${dir}/${file}: needs name + trigger frontmatter`)
      return { name: meta.name, trigger: meta.trigger, content: match[2].trim() }
    })
}

async function call<T>(apiKey: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

/** Creates/updates the procedure drafts on the agent's main branch, then publishes them. */
async function syncProcedures(apiKey: string, agentId: string, role: string) {
  const sources = readProcedures(role)
  if (!sources.length) return

  const agent = await call<{
    main_branch_id: string
    conversation_config: { agent: { prompt: { tool_ids?: string[] } } }
  }>(apiKey, `/agents/${agentId}`)
  const branch = `/agents/${agentId}/branches/${agent.main_branch_id}/procedures`

  const toolIds = new Map<string, string>()
  for (const id of agent.conversation_config.agent.prompt.tool_ids ?? []) {
    const tool = await call<{ tool_config: { name: string } }>(apiKey, `/tools/${id}`)
    toolIds.set(tool.tool_config.name, id)
  }

  // Create missing procedures first, so procedures can reference each other by id.
  const { procedures } = await call<{ procedures: { procedure_id: string; name: string }[] }>(
    apiKey,
    branch,
  )
  const procedureIds = new Map(procedures.map((p) => [p.name, p.procedure_id]))
  for (const source of sources) {
    if (procedureIds.has(source.name)) continue
    const created = await call<{ procedure_id: string }>(apiKey, branch, "POST", {
      name: source.name,
      type: "free_form",
      trigger: source.trigger,
      content: "(syncing)",
    })
    procedureIds.set(source.name, created.procedure_id)
  }
  for (const p of procedures) {
    if (!sources.some((s) => s.name === p.name))
      console.warn(
        `  ${p.name} (${p.procedure_id}) is not in prompts/procedures/${role}; left as is`,
      )
  }

  const resolve = (kind: string, name: string, ids: Map<string, string>) => {
    const id = ids.get(name)
    if (!id) throw new Error(`prompts/procedures/${role}: unknown ${kind} "${name}"`)
    return `[${kind} id="${id}"]`
  }
  for (const source of sources) {
    const content = source.content
      .replace(/\[tool name="([^"]+)"\]/g, (_, name: string) => resolve("tool", name, toolIds))
      .replace(/\[procedure name="([^"]+)"\]/g, (_, name: string) =>
        resolve("procedure", name, procedureIds),
      )
    await call(apiKey, `${branch}/${procedureIds.get(source.name)}/draft`, "PATCH", {
      name: source.name,
      type: "free_form",
      trigger: source.trigger,
      content,
    })
  }

  // Publishing = a new agent version on the branch, carrying every changed draft.
  await call(apiKey, `/agents/${agentId}?branch_id=${agent.main_branch_id}`, "PATCH", {
    version_description: "Sync procedures from prompts/procedures",
  })
  console.log(`  ${sources.length} procedures: ${sources.map((s) => s.name).join(" → ")}`)
}

const agents = {
  interviewer: {
    envKey: "ELEVENLABS_INTERVIEWER_AGENT_ID",
    name: "Socrates · Interviewer",
    prompt: "interviewer",
    firstMessage: "Hi {{expert_name}}, I'm Socrates. What are you about to work on?",
    placeholders: { expert_name: "Sabine", task: "Process supplier invoices" },
    // Experts pause to think while they work: don't jump in. turn_v3 is the prosody-aware
    // turn-taking that ships with expressive mode.
    turn: { turn_eagerness: "patient", turn_timeout: 15, turn_model: "turn_v3" },
    skipTurn: true,
    audioTags: [
      { tag: "curious", description: "Asking why the expert did something" },
      { tag: "thoughtful", description: "Playing back what you understood, or the teach-back" },
      { tag: "warm", description: "Thanking the expert or acknowledging a good explanation" },
      { tag: "apologetic", description: "You got something wrong and they corrected you" },
    ] satisfies AudioTag[],
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
  supervisor: {
    envKey: "ELEVENLABS_SUPERVISOR_AGENT_ID",
    name: "Socrates · Supervisor",
    prompt: "supervisor",
    firstMessage:
      "Hi {{learner_name}}, I'm Socrates. Go ahead, I'll stay quiet. Just ask if you need me.",
    placeholders: { learner_name: "Alex", expert_name: "Sabine", work_map: "(Work Map)" },
    // The learner is waiting on the answer, so don't hold back the turn; skip_turn filters out
    // thinking out loud. A run often takes longer than the default 10-minute call limit.
    turn: { turn_eagerness: "normal", turn_timeout: 15, turn_model: "turn_v3" },
    maxDurationSecs: 3600,
    skipTurn: true,
    audioTags: [
      { tag: "calm", description: "A heads-up before a mistake, or a held save" },
      { tag: "slow", description: "Stating a limit, an amount, or a rule word for word" },
      { tag: "friendly", description: "Answering a question the learner asked" },
      { tag: "reassuring", description: "The learner sounds unsure or stressed" },
    ] satisfies AudioTag[],
    tools: [
      clientTool(
        "look_at_screen",
        "Look at the learner's screen right now and get an answer to their question, grounded in what's on screen and the expert's Work Map. Use it for every question about their work.",
        {
          question: {
            type: "string",
            description:
              "The learner's question, in their words, with what 'this' or 'here' refers to if you know",
          },
        },
        45,
      ),
      clientTool(
        "show_step",
        "Show the learner the Work Map step your answer or heads-up is about: what the expert did on screen and why.",
        { step_id: { type: "string", description: "Id of the Work Map step, e.g. s4" } },
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

  // Optional role names: sync only those agents and leave the others as they are.
  const only = process.argv.slice(2)
  const unknown = only.filter((role) => !(role in agents))
  if (unknown.length) throw new Error(`Unknown agent(s): ${unknown.join(", ")}`)
  const selected = Object.entries(agents).filter(([role]) => !only.length || only.includes(role))

  for (const [role, agent] of selected) {
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
        tts: {
          model_id: TTS_MODEL,
          expressive_mode: true,
          suggested_audio_tags: "audioTags" in agent ? agent.audioTags : undefined,
        },
        conversation:
          "maxDurationSecs" in agent ? { max_duration_seconds: agent.maxDurationSecs } : undefined,
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
    if ("skipTurn" in agent && agent.skipTurn) {
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
    await syncProcedures(apiKey, agent_id, role)
  }
  console.log(`Agent ids written to ${ENV_FILE}. Restart \`npm run dev\` to pick them up.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
