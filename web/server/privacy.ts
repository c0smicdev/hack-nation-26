import { z } from "zod"

import type { PrivacySummary, Rect } from "../src/lib/api/types.js"

export const PRIVACY_POLICY = "socrates-pii-v1"
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_TEXT_CHARS = 160_000
const processedImages = new WeakSet<Buffer>()
const base64 = z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
const rect = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001)
const summary = z.object({
  policyVersion: z.literal(PRIVACY_POLICY),
  redactedCount: z.number().int().nonnegative(),
})
const imageResult = summary.extend({
  image: base64.max(16 * 1024 * 1024),
  mime: z.literal("image/png"),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  redactions: z.array(rect).max(20_000),
})
const textResult = z.object({ results: z.array(summary.extend({ text: z.string() })) })

export class PrivacyError extends Error {
  readonly status = 503
  readonly code: string
  constructor(code = "privacy_unavailable") {
    super("Privacy protection could not complete. Please retry; unprotected data is not forwarded.")
    this.code = code
  }
}

export interface ProcessedFrame {
  data: Buffer
  mime: "image/png"
  width: number
  height: number
  redactions: Rect[]
  privacy: PrivacySummary
}

async function call(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const url = process.env.SOCRATES_PRIVACY_URL
  const token = process.env.SOCRATES_PRIVACY_TOKEN
  if (!url || !token || token.length < 32) throw new PrivacyError("privacy_not_configured")
  let target: URL
  try {
    target = new URL(url)
  } catch {
    throw new PrivacyError("privacy_invalid_config")
  }
  if (
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    (target.protocol !== "https:" &&
      !(
        target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
      ))
  ) {
    throw new PrivacyError("privacy_invalid_config")
  }
  const timeout = Number(process.env.SOCRATES_PRIVACY_TIMEOUT_MS ?? 15_000)
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.any([
        AbortSignal.timeout(Math.min(30_000, Math.max(100, timeout || 15_000))),
        ...(signal ? [signal] : []),
      ]),
      redirect: "error",
    })
    if (!response.ok)
      throw new PrivacyError(response.status === 422 ? "privacy_unreadable" : "privacy_unavailable")
    const content = await response.text()
    if (content.length > 17 * 1024 * 1024) throw new PrivacyError("privacy_invalid_response")
    return JSON.parse(content) as unknown
  } catch (error) {
    if (error instanceof PrivacyError) throw error
    throw new PrivacyError(signal?.aborted ? "privacy_paused" : "privacy_unavailable")
  }
}

export function registerProcessedFrame(frame: ProcessedFrame) {
  if (
    frame.privacy.policyVersion !== PRIVACY_POLICY ||
    frame.mime !== "image/png" ||
    frame.data.length < 24 ||
    frame.data.readUInt32BE(0) !== 0x89504e47 ||
    frame.data.readUInt32BE(16) !== frame.width ||
    frame.data.readUInt32BE(20) !== frame.height
  ) {
    throw new PrivacyError("privacy_invalid_response")
  }
  processedImages.add(frame.data)
  return frame
}

export function assertProcessedImage(data: Buffer) {
  if (!processedImages.has(data)) throw new PrivacyError("privacy_unprocessed_image")
}

export async function protectImage(
  image: string,
  mime = "image/jpeg",
  masks: Rect[] = [],
  signal?: AbortSignal,
): Promise<ProcessedFrame> {
  if (
    image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
    !base64.safeParse(image).success ||
    !["image/png", "image/jpeg"].includes(mime)
  ) {
    throw new PrivacyError("privacy_invalid_image")
  }
  const validMasks = z.array(rect).max(100).safeParse(masks)
  if (!validMasks.success) throw new PrivacyError("privacy_invalid_image")
  const parsed = imageResult.safeParse(
    await call("/redact/image", { image, mime, masks: validMasks.data }, signal),
  )
  if (!parsed.success || parsed.data.width * parsed.data.height > 8_500_000)
    throw new PrivacyError("privacy_invalid_response")
  const result = parsed.data
  return registerProcessedFrame({
    data: Buffer.from(result.image, "base64"),
    mime: result.mime,
    width: result.width,
    height: result.height,
    redactions: result.redactions,
    privacy: { policyVersion: result.policyVersion, redactedCount: result.redactedCount },
  })
}

export async function protectTexts(texts: string[], signal?: AbortSignal) {
  if (texts.length > 2000 || texts.reduce((total, text) => total + text.length, 0) > MAX_TEXT_CHARS)
    throw new PrivacyError("privacy_text_too_large")
  if (!texts.length) return []
  const parsed = textResult.safeParse(await call("/redact/text", { texts }, signal))
  if (!parsed.success || parsed.data.results.length !== texts.length)
    throw new PrivacyError("privacy_invalid_response")
  return parsed.data.results
}

// These are protocol/provenance fields, not free text; replacing them breaks references.
const structural = new Set([
  "id",
  "sessionId",
  "sessionIds",
  "liveSessionId",
  "workMapId",
  "work_map_id",
  "basedOnWorkMapId",
  "matchedStepId",
  "stepId",
  "quoteId",
  "reasonQuoteId",
  "questionId",
  "question_id",
  "guardrailId",
  "fromId",
  "candidateStepId",
  "aboutCandidateStepId",
  "kind",
  "status",
  "source",
  "role",
  "screenshotUrl",
  "updatedAt",
  "startedAt",
  "policyVersion",
])

/** Batch free-text leaves without flattening numeric fields or rewriting IDs. */
export async function protectValue<T>(value: T, signal?: AbortSignal): Promise<T> {
  const texts: string[] = []
  const slots: {
    target: Record<string, unknown> | unknown[]
    key: string | number
    index: number
  }[] = []
  function clone(v: unknown, key = "", depth = 0): unknown {
    if (depth > 30) throw new PrivacyError("privacy_invalid_input")
    if (Array.isArray(v)) {
      const target: unknown[] = []
      v.forEach((item, i) => {
        if (typeof item === "string" && !structural.has(key) && item) {
          slots.push({ target, key: i, index: texts.push(item) - 1 })
          target[i] = ""
        } else target[i] = clone(item, key, depth + 1)
      })
      return target
    }
    if (v && typeof v === "object") {
      const target: Record<string, unknown> = Object.create(null) as Record<string, unknown>
      for (const [k, item] of Object.entries(v)) {
        if (typeof item === "string" && !structural.has(k) && item) {
          slots.push({ target, key: k, index: texts.push(item) - 1 })
          target[k] = ""
        } else target[k] = clone(item, k, depth + 1)
      }
      return target
    }
    return v
  }
  if (typeof value === "string") return (await protectTexts([value], signal))[0].text as T
  const output = clone(value)
  const results = await protectTexts(texts, signal)
  for (const slot of slots)
    (slot.target as Record<string | number, unknown>)[slot.key] = results[slot.index].text
  return output as T
}
