import { z } from "zod"

import type { Rect } from "../src/lib/api/types.js"
import { imageBlock, models, prompt, structured, text } from "./llm.js"

/**
 * Finds the screen area a caption is about. This is its own call (one screenshot, one caption)
 * because boxes from the busy per-tick vision call landed on the wrong element: that call sees
 * two frames and a dozen other jobs, and guessed fractions instead of reading the screen.
 */

const Located = z.object({
  found: z.boolean(),
  box: z
    .object({ left: z.number(), top: z.number(), right: z.number(), bottom: z.number() })
    .nullable(),
})

/** Pixel size of a JPEG or PNG, read from its header. */
export function imageSize(data: Buffer): { width: number; height: number } | undefined {
  if (data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
  }
  if (data[0] !== 0xff || data[1] !== 0xd8) return undefined
  let i = 2
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) {
      i++
      continue
    }
    const marker = data[i + 1]
    // Start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and CC (DAC) don't.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) }
    }
    i += 2 + data.readUInt16BE(i + 2)
  }
  return undefined
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** The focus rect (normalized 0..1) for `caption` on `image`, or undefined if there is none. */
export async function locateFocus(
  image: Buffer,
  caption: string,
  mime = "image/jpeg",
): Promise<Rect | undefined> {
  const size = imageSize(image)
  if (!size) return undefined
  const result = await structured({
    model: models.focus,
    effort: "low",
    maxTokens: 1000,
    system: prompt("locate-focus"),
    schema: Located,
    content: [
      imageBlock(image, mime),
      text(`Screenshot size: ${size.width} × ${size.height} pixels.\nCaption: ${caption}`),
    ],
  })
  const box = result.found ? result.box : null
  if (!box) return undefined
  const left = clamp01(Math.min(box.left, box.right) / size.width)
  const top = clamp01(Math.min(box.top, box.bottom) / size.height)
  const right = clamp01(Math.max(box.left, box.right) / size.width)
  const bottom = clamp01(Math.max(box.top, box.bottom) / size.height)
  if (right - left < 0.002 || bottom - top < 0.002) return undefined
  return { x: left, y: top, width: right - left, height: bottom - top }
}
