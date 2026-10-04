/** Preserve text for OCR; the server rejects oversized captures rather than forwarding originals. */
const FRAME_WIDTH = 2560
const THUMB_W = 48
const THUMB_H = 27
/** Mean absolute grayscale difference (0–255) below which two frames count as identical. */
const CHANGE_THRESHOLD = 1.5

export async function startScreenShare(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 5 },
    audio: false,
    // Chrome: offer the current tab's siblings first (the mock ERP).
    preferCurrentTab: false,
  } as DisplayMediaStreamOptions)
}

export interface Frame {
  /** Lossless PNG, base64 without the data: prefix. */
  base64: string
  thumb: Uint8ClampedArray
}

const canvas = document.createElement("canvas")
const thumbCanvas = document.createElement("canvas")
thumbCanvas.width = THUMB_W
thumbCanvas.height = THUMB_H

function grayscale(data: Uint8ClampedArray) {
  const out = new Uint8ClampedArray(data.length / 4)
  for (let i = 0; i < out.length; i++) {
    out[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  }
  return out
}

/** Grabs the current video frame; returns null if the video isn't ready. */
export function grabFrame(video: HTMLVideoElement): Frame | null {
  if (!video.videoWidth) return null
  const scale = Math.min(1, FRAME_WIDTH / video.videoWidth)
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height)

  const tctx = thumbCanvas.getContext("2d", { willReadFrequently: true })!
  tctx.drawImage(video, 0, 0, THUMB_W, THUMB_H)
  const thumb = grayscale(tctx.getImageData(0, 0, THUMB_W, THUMB_H).data)

  const base64 = canvas.toDataURL("image/png").split(",")[1]
  return { base64, thumb }
}

export function changed(a: Uint8ClampedArray | undefined, b: Uint8ClampedArray) {
  if (!a) return true
  let sum = 0
  for (let i = 0; i < b.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / b.length > CHANGE_THRESHOLD
}
