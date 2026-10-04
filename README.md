# Socrates

Socrates turns expert knowledge into guidance your team can use. It observes
screen-based work, asks about the reasoning behind decisions, and builds
reviewable workflows grounded in the expert's words and screen moments.

- **Capture:** record a task and discuss decisions at natural pauses.
- **Map:** clarify open questions and confirm the resulting workflow.
- **Guide:** support a teammate through a new case using the expert's reasoning.

## Quick Start

Requires Node.js 24 and npm. Use Chrome or Edge for screen sharing and microphone access.

```bash
cd web
npm ci
npm run dev:mock
```

Open [localhost:5173](http://localhost:5173). Mock mode requires no accounts or API keys.

For the real backend, create `web/.env.local` from
[`web/.env.example`](web/.env.example), configure Anthropic and ElevenLabs,
and set `VITE_API_URL=/api`. Supabase provides authentication and persistent
storage. Agent setup, database setup and environment variables are documented
in the [web development guide](web/README.md).

## Routes

| Route            | Purpose                      |
| ---------------- | ---------------------------- |
| `/`              | Public landing page          |
| `/login`         | Sign in or create an account |
| `/app`           | Workflow library             |
| `/capture`       | Capture sessions             |
| `/work-maps/:id` | Workflow details             |
| `/supervise/:id` | Guided workflow run          |
| `/erp`           | Synthetic invoice sandbox    |

Application routes require login when Supabase authentication is configured.
The previous `/landing` URL remains available.

## Development

React 19, TypeScript, Vite, Tailwind CSS, GSAP, React Router and TanStack Query.
The Node backend uses Claude, ElevenLabs and optional Supabase persistence.

```bash
cd web
npm run dev
npm run typecheck
npm run lint
npm run build
```

Source code lives in `web/src/`, backend logic in `web/server/`, Vercel entry
points in `web/api/`, and model prompts in `web/prompts/`. See
[`AGENTS.md`](AGENTS.md) for contribution rules and the
[API types](web/src/lib/api/types.ts) for the shared data contract.

## Deployment

Deploy on Vercel with root directory `web`, build command `npm run build`,
and output directory `dist`. Configure the variables from `web/.env.example`.
Provider API keys belong on the server, never in `VITE_*` variables.

## Privacy

This is a prototype: use synthetic data only. Off-the-record mode pauses capture
and questions. Live audio is processed by ElevenLabs. The separate Presidio
redaction integration has not yet been merged into `main`.
