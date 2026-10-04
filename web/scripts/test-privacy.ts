import assert from "node:assert/strict"
import { createServer as httpServer } from "node:http"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"
import { z } from "zod"

const root = fileURLToPath(new URL("../", import.meta.url))
process.chdir(root)
// Never use local account credentials or real model endpoints in this test.
delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SECRET_KEY
process.env.NODE_ENV = "test"
process.env.ANTHROPIC_API_KEY = "synthetic-test-key"
process.env.SOCRATES_PRIVACY_TOKEN = "synthetic-test-service-token-not-a-real-secret"
let imageFailure = false
let invalidImageResult = false
let holdImage: (() => void) | undefined
let waitForImage = false
let observedImage: (() => void) | undefined
const payloads: Record<string, unknown>[] = []
const safePng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const rawPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=="
const protect = (text: string) =>
  text.replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL_ADDRESS:0123456789abcdef]")

const fake = httpServer(async (request, response) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as Record<string, unknown>
  response.setHeader("Content-Type", "application/json")
  if (request.url === "/redact/text") {
    const texts = body.texts as string[]
    response.end(
      JSON.stringify({
        results: texts.map((text) => ({
          text: protect(text),
          policyVersion: "socrates-pii-v1",
          redactedCount: text.includes("@") ? 1 : 0,
        })),
      }),
    )
  } else if (request.url === "/redact/image") {
    observedImage?.()
    if (waitForImage)
      await new Promise<void>((resolve) => {
        holdImage = resolve
      })
    if (imageFailure) {
      response.statusCode = 503
      response.end("{}")
      return
    }
    response.end(
      JSON.stringify({
        image: safePng,
        mime: "image/png",
        width: invalidImageResult ? 9000 : 1,
        height: 1,
        redactions: [{ x: 0, y: 0, width: 1, height: 1 }],
        policyVersion: "socrates-pii-v1",
        redactedCount: 1,
      }),
    )
  } else if (request.url?.startsWith("/v1/messages")) {
    payloads.push(body)
    const format = body.output_config as {
      format: { schema: { properties?: Record<string, unknown> } }
    }
    const output = format.format.schema.properties?.found
      ? { found: false, box: null }
      : {
          screen: "Invoice EUR 7200.00",
          events: [
            {
              text: "canary@example.test changed account to 0400",
              important: false,
              candidateStepId: null,
              stepTitle: null,
              stepKind: null,
              decision: null,
              matchedStepId: null,
              sameDecision: null,
            },
          ],
          question: null,
          debriefQuestions: [],
        }
    response.end(
      JSON.stringify({
        id: "msg-test",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        content: [{ type: "text", text: JSON.stringify(output) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )
  } else {
    response.statusCode = 404
    response.end("{}")
  }
})
await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve))
const address = fake.address()
assert(address && typeof address !== "string")
process.env.SOCRATES_PRIVACY_URL = `http://127.0.0.1:${address.port}`
process.env.ANTHROPIC_BASE_URL = process.env.SOCRATES_PRIVACY_URL
const vite = await createServer({
  configFile: false,
  root,
  envFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: "custom",
})
let passed = 0
async function test(name: string, run: () => Promise<void> | void) {
  await run()
  passed += 1
  console.log(`PASS ${name}`)
}
try {
  const privacy = (await vite.ssrLoadModule(
    "/server/privacy.ts",
  )) as typeof import("../server/privacy.js")
  const storage = (await vite.ssrLoadModule(
    "/server/store.ts",
  )) as typeof import("../server/store.js")
  const capture = (await vite.ssrLoadModule(
    "/server/capture.ts",
  )) as typeof import("../server/capture.js")
  const access = (await vite.ssrLoadModule(
    "/server/access.ts",
  )) as typeof import("../server/access.js")
  const fences = (await vite.ssrLoadModule(
    "/server/session-privacy.ts",
  )) as typeof import("../server/session-privacy.js")
  const llm = (await vite.ssrLoadModule("/server/llm.ts")) as typeof import("../server/llm.js")
  const focus = (await vite.ssrLoadModule(
    "/server/focus.ts",
  )) as typeof import("../server/focus.js")
  const router = (await vite.ssrLoadModule(
    "/server/router.ts",
  )) as typeof import("../server/router.js")
  storage.store.workMaps = []
  storage.store.sessions.clear()
  storage.store.frames.clear()
  storage.store.frameMetadata.clear()
  storage.store.access.clear()
  await test("structured text preserves identifiers, numbers and nested fields", async () => {
    const value = await privacy.protectValue({
      id: "s-0400",
      kind: "judgment",
      amount: 7200,
      nested: ["canary@example.test"],
      record: { costCenter: "0400", name: "canary@example.test" },
    })
    assert.equal(value.id, "s-0400")
    assert.equal(value.amount, 7200)
    assert.equal(value.record.costCenter, "0400")
    assert(!JSON.stringify(value).includes("canary@example.test"))
  })
  await test("raw image buffers cannot reach imageBlock or saveFrame", () => {
    const raw = Buffer.from(rawPng, "base64")
    assert.throws(() => llm.imageBlock(raw), privacy.PrivacyError)
    assert.throws(
      () =>
        storage.saveFrame(
          {
            data: raw,
            mime: "image/png",
            width: 1,
            height: 1,
            redactions: [],
            privacy: { policyVersion: "socrates-pii-v1", redactedCount: 0 },
          },
          "missing",
          0,
        ),
      privacy.PrivacyError,
    )
  })
  await test("manually constructed model image blocks cannot bypass the gateway", async () => {
    await assert.rejects(
      llm.structured({
        model: "claude-haiku-4-5",
        system: "Synthetic test",
        schema: z.object({ found: z.boolean() }),
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: rawPng } },
        ],
      }),
      privacy.PrivacyError,
    )
    assert.equal(payloads.length, 0)
  })
  await test("invalid privacy responses and timeouts fail closed", async () => {
    invalidImageResult = true
    await assert.rejects(privacy.protectImage(rawPng, "image/png"), privacy.PrivacyError)
    invalidImageResult = false
    waitForImage = true
    process.env.SOCRATES_PRIVACY_TIMEOUT_MS = "100"
    try {
      await assert.rejects(privacy.protectImage(rawPng, "image/png"), privacy.PrivacyError)
    } finally {
      holdImage?.()
      waitForImage = false
      delete process.env.SOCRATES_PRIVACY_TIMEOUT_MS
    }
    assert.equal(payloads.length, 0)
  })
  const session = await capture.createSession({
    title: "Synthetic invoice",
    task: "Book EUR 7200 equipment",
    expertName: "Synthetic Expert",
    expertRole: "Finance",
  })
  await capture.updateSession(session.id, { status: "live" })
  const tick = {
    at: 1,
    image: rawPng,
    mime: "image/png" as const,
    erp: [
      { at: 1, kind: "field_change" as const, text: "canary@example.test changed account to 0400" },
    ],
    typing: false,
    speaking: false,
  }
  await test("redactor failure saves nothing and calls no model", async () => {
    imageFailure = true
    await assert.rejects(capture.processTick(session.id, tick), privacy.PrivacyError)
    assert.equal(payloads.length, 0)
    assert.equal(storage.store.frames.size, 0)
    assert(
      !JSON.stringify(storage.getRuntime(session.id).pendingErp).includes("canary@example.test"),
    )
    imageFailure = false
  })
  await test("current and previous frames are processed before model calls", async () => {
    const result = await capture.processTick(session.id, tick)
    assert(result.processed)
    assert(!JSON.stringify(result).includes("canary@example.test"))
    await capture.processTick(session.id, { ...tick, at: 2 })
    assert.equal(payloads.length, 2)
    const sent = JSON.stringify(payloads)
    assert(!sent.includes(rawPng))
    assert(sent.includes(safePng))
    assert(!sent.includes("canary@example.test"))
    assert(!JSON.stringify(storage.getRuntime(session.id).events).includes("canary@example.test"))
    for (const frame of storage.store.frames.values())
      assert.equal(frame.data.toString("base64"), safePng)
  })
  await test("pause during OCR discards the tick without model/storage writes", async () => {
    const beforeCalls = payloads.length
    const beforeFrames = storage.store.frames.size
    waitForImage = true
    const observed = new Promise<void>((resolve) => {
      observedImage = resolve
    })
    const job = capture.processTick(session.id, { ...tick, at: 3 })
    await observed
    await fences.setSessionPrivacy(storage.getRuntime(session.id), true)
    holdImage?.()
    const result = await job
    waitForImage = false
    observedImage = undefined
    assert(!result.processed)
    assert.equal(payloads.length, beforeCalls)
    assert.equal(storage.store.frames.size, beforeFrames)
    assert.equal(storage.getRuntime(session.id).pendingErp.length, 0)
    const event = await capture.recordEvent(session.id, {
      at: 4,
      kind: "speech",
      text: "do-not-store@example.test",
    })
    assert.equal(event.text, "")
    await fences.setSessionPrivacy(storage.getRuntime(session.id), false)
  })
  await test("focus evaluation protects raw images and captions before the model", async () => {
    const start = payloads.length
    await focus.locateFocus(Buffer.from(rawPng, "base64"), "canary@example.test", "image/png")
    assert.equal(payloads.length, start + 1)
    const sent = JSON.stringify(payloads.at(-1))
    assert(sent.includes(safePng))
    assert(!sent.includes(rawPng) && !sent.includes("canary@example.test"))
  })
  await test("owners and explicit readers are isolated", async () => {
    storage.store.access.set(session.id, { ownerId: "owner", readerIds: ["reader"] })
    access.asUser("stranger", () =>
      assert.throws(() => storage.getRuntime(session.id), storage.HttpError),
    )
    access.asUser("reader", () => {
      assert(storage.getRuntime(session.id))
      assert.throws(() => access.requireAccess(session.id, true), storage.HttpError)
    })
    access.asUser("owner", () => access.requireAccess(session.id, true))
  })
  await test("frame response is processed and not cached; missing legacy frame is blocked", async () => {
    const id = storage.store.frames.keys().next().value!
    const response = await router.handle(new Request(`http://localhost/api/frames/${id}`))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal(Buffer.from(await response.arrayBuffer()).toString("base64"), safePng)
    assert.equal(
      (await router.handle(new Request("http://localhost/api/frames/fr-legacy"))).status,
      404,
    )
  })
  await test("production does not serve frames without configured authentication", async () => {
    process.env.NODE_ENV = "production"
    assert.equal(
      (await router.handle(new Request("http://localhost/api/frames/fr-legacy"))).status,
      503,
    )
    process.env.NODE_ENV = "test"
  })
  await test("missing privacy configuration cannot fall back to original data", async () => {
    const url = process.env.SOCRATES_PRIVACY_URL
    delete process.env.SOCRATES_PRIVACY_URL
    await assert.rejects(privacy.protectImage(rawPng, "image/png"), privacy.PrivacyError)
    const response = await router.handle(
      new Request("http://localhost/api/privacy/text", {
        method: "POST",
        body: JSON.stringify({ texts: ["canary@example.test"] }),
      }),
    )
    assert.equal(response.status, 503)
    assert(!(await response.text()).includes("canary@example.test"))
    process.env.SOCRATES_PRIVACY_URL = url
  })
  console.log(`${passed} privacy integration tests passed; no external provider used.`)
} finally {
  holdImage?.()
  await vite.close()
  await new Promise<void>((resolve, reject) =>
    fake.close((error) => (error ? reject(error) : resolve())),
  )
}
