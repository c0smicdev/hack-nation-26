# Socrates — web

React 19 · TypeScript · Vite · Tailwind v4 · shadcn/ui (Radix) · React Router · TanStack Query · `@elevenlabs/react` · Claude (`@anthropic-ai/sdk`)

```bash
npm install
npm run dev          # http://localhost:5173 — app + backend (/api) in one process
npm run dev:mock     # same UI on in-memory mocks, no keys needed
npm run setup:agents # create/update the ElevenLabs interviewer + tutor agents and their procedures
```

| Script                 | What it does                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`          | Dev server with HMR; serves the backend under `/api`                                           |
| `npm run dev:mock`     | Forces mock data even if `.env.local` points at the backend                                    |
| `npm run setup:agents` | Pushes `prompts/interviewer.md` + `prompts/tutor.md` and `prompts/procedures/` to ElevenAgents |
| `npm run eval:focus`   | Scores step-screenshot focus boxes against `eval/focus/labels.json` (needs the API key)        |
| `npm run build`        | Typecheck + production build                                                                   |
| `npm run lint`         | ESLint                                                                                         |
| `npm run format`       | Prettier (with Tailwind class order)                                                           |
| `npm run typecheck`    | `tsc -b` only (app, Vite config and server)                                                    |

## Setup (real backend + voice)

1. `cp .env.example .env.local` and fill in `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, and `VITE_API_URL=/api`. `.env.local` is gitignored; never prefix secrets with `VITE_`.
2. `npm run setup:agents`: creates the agents (interviewer, tutor, new-workflow drafter), syncs and publishes their procedures, and writes `ELEVENLABS_INTERVIEWER_AGENT_ID` / `ELEVENLABS_TUTOR_AGENT_ID` / `ELEVENLABS_DRAFTER_AGENT_ID` into `.env.local`. Re-run it after editing the agent prompts or procedures.
3. `npm run dev`. Use Chrome (tab sharing + microphone).

Without agent ids (or if the mic is blocked) the voice panel falls back to **text mode**: questions, debrief and teach-back still work with buttons and text boxes.

## Pages

| Route                  | Page                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `/`                    | **Work Maps** library                                                                                  |
| `/work-maps/:id`       | **Work Map**: steps, screen moments, reasons, guardrails, clickable **flowchart**, debrief, teach-back |
| `/ask`                 | **Ask Socrates**: Q&A across Work Maps, answers cite the step                                          |
| `/capture`             | **Capture**: start a session, list sessions                                                            |
| `/capture/:id`         | **Live session**: intake (memory lookup) → screen capture with live questions → debrief → teach-back   |
| `/teach`, `/teach/:id` | **Teach**: a new hire works training cases in the ERP; the tutor holds wrong saves                     |
| `/erp`                 | **Mock ERP** (Nordwind): open in its own tab, share it during capture                                  |

## Demo script

1. **Capture.** `/capture` → _Open mock ERP_ → _Start session_ → _Share screen & start talking_ and pick the "Nordwind ERP" tab. Tell Socrates what you're doing; it checks memory (the seeded AP Work Map matches, so say "it's new" to document from scratch, or "same" to see it skip known steps).
2. Work the **Month-end batch**: re-code 4471 to `0400` capex, send 4472 (Plzeň) for a second approval, hold 4473 (Weber, December), post 4474. Think out loud. Socrates asks at pauses (never while you type or talk, max 5 per 10 min).
3. Say "I'm done". Answer the debrief questions, then confirm (or correct) the teach-back. The Work Map is saved to memory with a flowchart.
4. **Teach.** Open the Work Map → _Teach a new hire_ → _Start lesson_. In the ERP switch to **Training cases** and try to post 4480 as opex: the save is held and the tutor explains it in the expert's words.

## Structure

```
server/                backend (runs in the Vite dev server, and on Vercel via api/index.ts)
  router.ts            REST routes
  capture.ts           sessions, ticks → vision → events/questions, memory lookup
  focus.ts             focus box for a step's screenshot (one grounding call per important event)
  workmap.ts           draft Work Map, debrief, teach-back, merge into memory
  teach.ts             save checks, ElevenLabs signed URLs, Ask
  llm.ts               Claude calls (structured output, validated with zod)
  store.ts             in-memory storage (MVP)
prompts/               one markdown file per prompt (vision, Work Map, tutor, agents…)
  procedures/          ElevenLabs Procedures, one file per phase: interviewer/ (Intake → Capture →
                       Debrief → Teach-back), tutor/ (lesson start, case, held save, saved, wrap-up)
                       and drafter/ (describe → create workflow, hand edit)
scripts/setup-agents.ts  ElevenAgents config as code (agents, tools, procedures)
scripts/eval-focus.ts    focus-box eval; frames live in eval/focus/frames/ (gitignored, real recordings)
src/
  app/                 shell: router, providers, layout, paths
  components/          shared components (voice panel, screen moment, page header…)
  features/
    work-maps/         library, Work Map document, flowchart
    ask/               Q&A panel and page
    capture/           session list, live session, debrief
    teach/             lesson with the tutor
    erp/               mock ERP (separate shell)
  lib/
    api/               types.ts (THE contract), client.ts, http.ts, mock/
    voice/             useVoiceAgent (ElevenAgents)
    capture/           screen sampling + frame diff
    erp/               ERP demo data + BroadcastChannel protocol
```

Each feature folder owns its pages, components and `hooks.ts` (React Query). Features may import from `lib/`, `components/` and `app/paths`, not from each other (except `AskPanel`).

## How the pieces talk

- **Mock ERP ↔ Socrates:** same origin, so a `BroadcastChannel` (`lib/erp/bridge.ts`): screen, field changes, typing, actions, and a save gate (`save_request` → `save_pending` → `save_decision`) that only waits while a Teach lesson sends a heartbeat.
- **Capture:** the session page samples the shared tab every 1.5 s, skips unchanged frames, keeps one vision call in flight (stale frames are dropped), and posts `Tick`s. Vision (Claude Haiku 4.5) returns events, candidate steps and at most one question; the page decides _when_ to ask.
- **Voice:** the browser gets a signed URL from `/api/voice/:role`; the agent calls client tools (`lookup_memory`, `start_capture`, `set_off_record`, `finish_task`, `record_debrief_answer`, `get_teach_back`, `reply_teach_back`, `finish_lesson`). Screen events reach it as contextual updates; live questions as `[QUESTION …]` messages.
- **Quotes:** Work Map JSON from Claude references transcript utterances by id; the backend copies the expert's exact words, so every reason and guardrail links to what they actually said.

## Working with the backend

- **Mock by default.** Without `VITE_API_URL`, `api` is `mockApi` (no vision or voice; ERP signals become events and questions are canned).
- **Changing the contract:** edit `lib/api/types.ts`, then update `client.ts`, `http.ts`, `mock/` and `server/`. Tell the team.
- **Storage is in memory** (`server/store.ts`): restart = clean slate, seeded with the fixture Work Maps. Move to Postgres + Blob before relying on Vercel (each warm function has its own copy).
- **Models:** vision and focus boxes `claude-haiku-4-5`, everything else `claude-opus-5-5`; override with `SOCRATES_VISION_MODEL` / `SOCRATES_FOCUS_MODEL` / `SOCRATES_REASONING_MODEL`. The voice agents run Claude Sonnet 5.5 inside ElevenAgents (`ELEVENLABS_LLM` in the setup script) and speak in [Expressive Mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode): Eleven v3 Conversational TTS plus the `turn_v3` turn-taking model. Each agent gets suggested audio tags (`audioTags` in the setup script) and tone rules in its prompt's "Your voice" section; `use-voice-agent.ts` strips the tags from the on-screen transcript.

## Recipes

**Add a page:** create `features/<name>/<name>-page.tsx`, add a route in `app/router.tsx`, add a path in `app/paths.ts`, and add a nav item in `app/app-layout.tsx`.

**Add an API call:** add the method to `SocratesApi` in `client.ts`, implement it in `http.ts`, `mock/index.ts` and a route in `server/router.ts`, then wrap it in a hook.

**Tune a prompt:** edit `prompts/*.md`. Server prompts reload on the next call in dev; agent prompts need `npm run setup:agents`.

**Tune an agent phase:** each phase of the voice agents is an ElevenLabs [free-form procedure](https://elevenlabs.io/docs/eleven-agents/customization/procedures/free-form-procedures) in `prompts/procedures/<agent>/`. A file is `name:` + `trigger:` frontmatter and a markdown body; an empty `trigger:` makes a sub-procedure that only runs when another procedure references it. Reference tools as `[tool name="start_capture"]` and other procedures as `[procedure name="Capture"]` (the script resolves them to ids). The system prompt (`prompts/<agent>.md`) keeps only persona and global rules. Run `npm run setup:agents` to publish. Edit procedures here, not in the dashboard: the script overwrites procedures with the same name.

**Add a shadcn component:** `npx shadcn@latest add <component>` (run from `web/`).

## Privacy

Off the record (switch or "take that off the record") stops frames, speech storage and questions; only the time span is logged. Screenshots are not yet redacted server-side (Presidio is still to do); `ScreenMomentView` draws `redactions` boxes as a second line of defence only. Demo with fake data only.

## Deploy (Vercel)

Root Directory = `web`. `vercel.json` routes `/api/*` to the single function `api/index.ts` (prompts are bundled via `includeFiles`) and everything else to `index.html`. Set the server env vars and `VITE_API_URL=/api`. Not yet tested on Vercel, and in-memory storage won't persist there.
