import { readFileSync } from "node:fs"
import path from "node:path"

import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import type { z } from "zod"

import { HttpError } from "./store.js"

/**
 * Vision runs on every tick, so it uses the fast model; everything that writes
 * the Work Map or judges a learner's decision uses Opus. Override via env.
 */
export const models = {
  vision: process.env.SOCRATES_VISION_MODEL ?? "claude-haiku-4-5",
  reasoning: process.env.SOCRATES_REASONING_MODEL ?? "claude-opus-5-5",
}

let client: Anthropic | undefined
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "ANTHROPIC_API_KEY is not set (web/.env.local)")
  }
  return (client ??= new Anthropic())
}

const promptCache = new Map<string, string>()

/** Prompts live in web/prompts/*.md so we can tune them without touching code. */
export function prompt(name: string, vars: Record<string, string> = {}) {
  let text = promptCache.get(name)
  if (text === undefined) {
    text = readFileSync(path.join(process.cwd(), "prompts", `${name}.md`), "utf8")
    if (process.env.NODE_ENV === "production") promptCache.set(name, text)
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "")
}

export type Content = Anthropic.Beta.BetaContentBlockParam[]

/**
 * One structured call: Claude answers with JSON matching `schema`. The schema is
 * also our validation boundary, so callers can trust the result's shape.
 */
export async function structured<S extends z.ZodType>(opts: {
  model: string
  system: string
  content: Content
  schema: S
  effort?: "low" | "medium" | "high"
  maxTokens?: number
}): Promise<z.infer<S>> {
  // Haiku 4.5 takes neither `effort` nor server-side fallbacks.
  const haiku = opts.model.startsWith("claude-haiku")
  const response = await anthropic().beta.messages.parse({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: {
      ...(haiku ? {} : { effort: opts.effort ?? "medium" }),
      format: betaZodOutputFormat(opts.schema),
    },
    // Re-runs a classifier-declined request on Anthropic's recommended fallback model.
    ...(haiku ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
  })
  if (response.stop_reason === "refusal") {
    throw new HttpError(502, "The model declined this request")
  }
  if (response.stop_reason === "max_tokens") {
    throw new HttpError(502, "The model ran out of tokens before finishing its answer")
  }
  if (response.parsed_output == null) {
    throw new HttpError(502, "The model's answer didn't match the expected shape")
  }
  return response.parsed_output
}

export function imageBlock(data: Buffer, mime = "image/jpeg"): Anthropic.Beta.BetaImageBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: mime as "image/jpeg", data: data.toString("base64") },
  }
}

export const text = (value: string): Anthropic.Beta.BetaTextBlockParam => ({
  type: "text",
  text: value,
})
