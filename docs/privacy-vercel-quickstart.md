# Vercel + Presidio: shortest deployment path

Presidio is a self-hosted open-source SDK, not a Microsoft account/API-key product.
The app stays on Vercel. Our Docker service runs Presidio + Tesseract DE/EN OCR
+ spaCy DE/EN, and Vercel calls it before Claude and storage. No Node-only fallback.

## 1. Render: host Presidio

1. Commit/push this feature branch through the team's normal Git workflow.
   Local changes are not visible to Render or Vercel until pushed.
2. Create/sign into a Render account and connect the GitHub repository.
3. Choose New > Blueprint, select this branch, and the root `render.yaml`.
4. Review the deployment summary and price before confirming. The blueprint
   chooses a paid `1c-2g` instance (2 GiB, Frankfurt), not a free sleeping service.
   No purchase or cloud deployment has been performed by the coding agent.
5. Wait for the Docker build and the service status to become Live. The first
   build installs OCR/NLP models and can take several minutes.
6. From the service dashboard, obtain its HTTPS URL and generated
   `SOCRATES_PRIVACY_TOKEN`. Do not post the token in chat or commit it.
   The other generated secret, `SOCRATES_PRIVACY_ALIAS_KEY`, stays only on Render;
   keep it stable to preserve aliases. No database/disk is needed for this service.

`/ready` is a public readiness check with only a boolean. `/health`, `/redact/text`
and `/redact/image` require the service token. Request payload/access logging is
disabled in the app. Auto-deploy is off; redeploy manually after service changes.

## 2. Vercel: connect the app

Keep the existing Anthropic, ElevenLabs, agent IDs and Supabase keys. Add these
SERVER variables in the environments you will deploy (Preview and/or Production):

```dotenv
SOCRATES_PRIVACY_URL=https://YOUR-SERVICE.onrender.com
SOCRATES_PRIVACY_TOKEN=SAME_GENERATED_TOKEN_FROM_RENDER
SOCRATES_PRIVACY_TIMEOUT_MS=15000
```

Use the service origin without `/health` or `/redact`. Never prefix these secrets
with `VITE_`. Keep `VITE_API_URL=/api`. Root Directory: `web`; build: `npm run build`;
Node 24 is declared in `package.json`. Redeploy after changing variables.

With real Supabase, apply the already-provided `web/supabase/privacy.sql` once.
Already applied? No further migration. Existing ownerless resources/legacy images
remain blocked; use a NEW synthetic session for the deployment acceptance test.

## 3. Acceptance test

On the Vercel preview URL, sign in, create a new synthetic session and share the
mock ERP. Check a stored screenshot: names/email/IBAN should be pixel-redacted,
while amounts, cost centers and business decision context stay readable.
Pause/resume, then save and open the workflow. Provider errors block forwarding.
Judges use the Vercel URL; they do not install Docker or provide keys.

The local service/integration tests do not confirm Render/Vercel deployment.
No connected hosting account is available to this agent. Automatic OCR/NER is not
a complete anonymity guarantee. Demo with fake data. Live microphone audio still
goes directly to ElevenLabs, as accepted for this task.

## Local

Use `privacy/README.md` to start Docker, then `npm run dev` from `web` with the
service URL/token and existing app keys configured. `npm run dev:mock` needs
neither the service nor keys and does not test real redaction.

References: [Presidio](https://github.com/data-privacy-stack/presidio),
[Render Blueprints](https://render.com/docs/infrastructure-as-code),
[Blueprint fields and generated secrets](https://render.com/docs/blueprint-spec),
[Free service sleep limitations](https://render.com/docs/free).
