# Socrates — web

React 19 · TypeScript · Vite · Tailwind v4 · shadcn/ui (Radix) · React Router · TanStack Query

```bash
npm install
npm run dev        # http://localhost:5173 (runs on mock data)
```

| Script              | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Dev server with HMR                  |
| `npm run build`     | Typecheck + production build         |
| `npm run lint`      | ESLint                               |
| `npm run format`    | Prettier (with Tailwind class order) |
| `npm run typecheck` | `tsc -b` only                        |

## Pages

| Route            | Page                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | **Work Maps** library: search and filter captured workflows                                                                                                                        |
| `/work-maps/:id` | **Work Map**: step timeline, screen moment, decision, the expert's reason, guardrails, edge cases, debrief and teach-back. `?step=s4` deep-links a step; ← / → moves between steps |
| `/ask`           | **Ask Socrates**: Q&A across all workflows, answers cite the exact step                                                                                                            |
| `/capture`       | **Capture**: extension status, live event feed, off-the-record switch, sessions                                                                                                    |

## Structure

```
src/
  app/                 shell: router, providers, layout, paths
  components/          shared app components (page header, empty/error states)
  components/ui/       shadcn components (generated, don't hand-edit much)
  features/
    work-maps/         library + work map document
    ask/               Q&A panel and page
    capture/           extension status, live feed, sessions
  lib/
    api/
      types.ts         ← THE data contract (shared with backend + extension)
      client.ts        SocratesApi interface
      http.ts          real backend (REST)
      mock/            in-memory fixtures (default)
    format.ts          timestamps, durations, pluralize…
public/mock/           fake ERP screenshots used by the fixtures
```

Each feature folder owns its pages, components and `hooks.ts` (React Query). Features may import from `lib/`, `components/` and `app/paths`, but not each other's internals. The one exception is `AskPanel`, which the Work Map page reuses.

## Working with the backend

- **Mock by default.** Without `VITE_API_URL`, `api` is `mockApi`, so the UI works before the backend exists.
- **Real backend:** copy `.env.example` to `.env.local` and set `VITE_API_URL=http://localhost:8000/api`. Endpoints are listed in `src/lib/api/http.ts`.
- **Changing the contract:** edit `lib/api/types.ts`, then update `client.ts`, `http.ts` and `mock/`. Tell the team, because the backend's Work Map JSON (LLM output) has to match these types.
- **Live data** is polled every 2 s (`features/capture/hooks.ts`). Swap in SSE or WebSocket there without touching the pages.

## Recipes

**Add a page:** create `features/<name>/<name>-page.tsx`, add a route in `app/router.tsx`, add a path in `app/paths.ts`, and add a nav item in `app/app-layout.tsx`.

**Add an API call:** add the method to `SocratesApi` in `client.ts`, implement it in `http.ts` and `mock/index.ts`, then wrap it in a hook in the feature's `hooks.ts`.

**Add a shadcn component:** `npx shadcn@latest add <component>` (run from `web/`).

**Voice (ElevenLabs):** add a `features/voice/` folder with `@elevenlabs/react`. The interviewer and tutor can call the same `api.ask` / Work Map data, and `AskPanel` is where the voice button goes.

## Privacy

Screenshots should be redacted **server-side** (e.g. Presidio) before they reach the frontend. `ScreenMomentView` also draws `redactions` boxes on top as a second line of defence. Never rely on the overlay alone, because the raw image would still be downloadable.

## Deploy (Vercel)

Import the repo and set **Root Directory = `web`**. The framework preset is detected as Vite. `vercel.json` rewrites all routes to `index.html` for client-side routing. Set `VITE_API_URL` in the project's environment variables.
