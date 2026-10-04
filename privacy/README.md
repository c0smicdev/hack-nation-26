# Socrates privacy service

**Required for the real backend.** Presidio runs as a separate Docker service;
the Vercel backend calls it before Claude and storage. There is no Node-only
fallback. Deploy with the root `render.yaml` and follow
[the Vercel + Presidio quickstart](../docs/privacy-vercel-quickstart.md).

Local Tesseract OCR, Presidio and DE/EN spaCy models. No Microsoft/Azure API key
is needed. Models are downloaded at image build time, not while handling data.

## Local start (PowerShell, repository root)

Requires Docker Desktop's Linux engine and Node >= 22.22 (Node 24 works).
Generate separate secrets in the current terminal; these commands do not print them:

```powershell
$env:SOCRATES_PRIVACY_TOKEN = (node -p "require('node:crypto').randomBytes(32).toString('hex')").Trim()
$env:SOCRATES_PRIVACY_ALIAS_KEY = (node -p "require('node:crypto').randomBytes(32).toString('hex')").Trim()
docker compose -f privacy/compose.yaml up -d --build
$env:SOCRATES_PRIVACY_URL = 'http://127.0.0.1:8081'
$env:VITE_API_URL = '/api'
Set-Location web
npm run dev
```

The existing backend/Supabase/ElevenLabs settings still apply. With Supabase
configured, apply `web/supabase/privacy.sql` before using the real API.
For mocks instead: `npm run dev:mock`, no privacy service or account required.

Use persistent secrets in your deployment secret manager (or ignored
`privacy/.env` locally). Regenerating the alias key changes replacement values
and breaks matching against older aliases. Never put either secret in `VITE_*`.
`SOCRATES_PRIVACY_ALIAS_KEY` belongs only to the Python service.

```powershell
# From repository root; reads credentials from this terminal or privacy/.env.
Invoke-RestMethod http://127.0.0.1:8081/health -Headers @{Authorization="Bearer $env:SOCRATES_PRIVACY_TOKEN"}
docker compose -f privacy/compose.yaml down
```

## Activation in Supabase / Vercel

1. Run the existing `web/supabase/schema.sql` if this is a new database, then
   `web/supabase/privacy.sql` in the Supabase SQL editor. No existing data is deleted.
   This migration also makes an existing `frames` bucket private.
2. Run `web/supabase/privacy-inventory.sql`. Keep the `frames` bucket private.
   Existing sessions/workflows without verified owners are hidden from signed-in
   users; existing frames without current policy metadata are blocked.
3. Assign old resources to verified account IDs in `resource_access` only after
   ownership review. Workflow sharing uses its explicit `reader_ids`; no sharing
   UI or automatic team-wide access was added.
4. Deploy this service to a trusted container host. Set strong service/alias
   secrets, HTTPS, access restrictions, and disable body/exception payload logging.
   Vercel needs a reachable URL, not its own `127.0.0.1`.
5. Set `SOCRATES_PRIVACY_URL`, `SOCRATES_PRIVACY_TOKEN` and optionally
   `SOCRATES_PRIVACY_TIMEOUT_MS` on the Node backend. Production additionally
   requires configured Supabase authentication. Missing protection blocks requests.
6. Verify representative synthetic screens on the deployment before real data.
   Old screenshots/transcripts, backups and vendor histories require a separate
   approved migration/retention procedure. No automatic backfill/deletion exists.

## Policy and limits

- Images: black pixels burned into a new metadata-free PNG, not just UI overlays.
  Current and previous frames plus focus calls use only processed image buffers.
- Text: stable keyed HMAC placeholders; no cleartext-to-alias database.
- DE/EN names, email, phone, IBAN, credit cards, IP addresses; labeled addresses,
  supplier/customer names and selected secret formats. Optional known business
  names: `SOCRATES_PRIVACY_KNOWN_VALUES='["Synthetic Supplier"]'` on the service.
- Amounts, cost centers and explicit month/country business qualifiers stay intact.
  Protocol identifiers are preserved; arbitrary business IDs are not comprehensively
  classified. Unlabeled organizations/addresses and non-text PII need further rules.
- API supports normalized `masks` for known sensitive regions before OCR; no mask
  editor was added. Automatic OCR/NER cannot guarantee complete detection.
- Input image max 5 MiB / 8.5 million pixels, text batches max 160,000 characters.
  Hosting can impose smaller request limits. Unreadable OCR, invalid responses,
  timeouts or missing configuration block forwarding; there is no raw fallback.
- Live audio still goes directly to ElevenLabs, as accepted for this task.
  App transcripts/context are protected afterwards. Off-record stops browser
  transport and invalidates pending results. Already-started remote calls cannot
  be recalled; this is not a zero-audio-disclosure architecture.
- Presidio Image Redactor is beta. This is tested protection, not guaranteed
  legal anonymization or production approval for all kinds of data.

## Verification

```powershell
docker build -t socrates-privacy:local privacy
docker run --rm --network none --entrypoint pytest socrates-privacy:local -q -s -p no:cacheprovider /app/test_privacy.py
Set-Location web
npm run test:privacy
npm run typecheck
npm run lint
npm run build
```

SQL tests: `web/supabase/test-privacy.sql` is for an isolated disposable PostgreSQL
database ONLY; it creates test roles/tables and rolls everything back. Never use
that test harness against a team database. The service tests use synthetic PII;
Node tests use local fake providers and explicitly disable Supabase credentials.
