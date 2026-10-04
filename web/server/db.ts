import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { CaptureStatus, WorkMap } from "../src/lib/api/types.js"
import { type Frame, type SessionRuntime, store } from "./store.js"
import {
  assertProcessedImage,
  PRIVACY_POLICY,
  PrivacyError,
  registerProcessedFrame,
} from "./privacy.js"

/**
 * Supabase persistence for the in-memory store. The route handlers keep working
 * on `store` synchronously; `handle()` calls `syncFromDb()` before and
 * `flushToDb()` after each request. Without SUPABASE_URL / SUPABASE_SECRET_KEY
 * this is all a no-op and the store stays purely in memory.
 */

const FRAME_BUCKET = "frames"

// Survives Vite's server-module reloads, like the store itself.
const state = ((globalThis as { __socratesDb?: DbState }).__socratesDb ??= {
  hashes: { work_maps: new Map(), capture_sessions: new Map() },
  captureStatusHash: undefined,
  lastSync: undefined,
  uploadedFrames: new Set(),
  inFlight: 0,
})

interface DbState {
  /** JSON of each row as last read from / written to the DB. */
  hashes: Record<Table, Map<string, string>>
  captureStatusHash?: string
  /** Highest `updated_at` seen, so a sync only fetches what changed. */
  lastSync?: string
  /** Frames in memory that are already in Storage. */
  uploadedFrames: Set<string>
  /** Requests currently running in this instance. */
  inFlight: number
}

type Table = "work_maps" | "capture_sessions"

let client: SupabaseClient | null | undefined

export function db(): SupabaseClient | null {
  if (client === undefined) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  }
  return client
}

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Supabase ${what}: ${result.error.message}`)
  return result.data
}

/**
 * JSON with sorted keys. jsonb doesn't keep key order, so plain JSON.stringify of a
 * row read back never matches what we wrote, and every pull would look like a change.
 */
const stable = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )

type StoredSession = Omit<SessionRuntime, "visionBusy" | "pendingFocus" | "privacyController">

/** visionBusy and pendingFocus belong to this process; persisting them could leave a session stuck. */
function persisted(runtime: SessionRuntime): StoredSession {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { visionBusy, pendingFocus, privacyController, ...rest } = runtime
  return rest
}

/**
 * Pull rows other instances changed. Only runs while no other request is in
 * flight here, so it never swaps out an object a running handler still holds.
 */
async function pull(supabase: SupabaseClient) {
  if (state.inFlight > 1) return
  const access = check(
    await supabase.from("resource_access").select("resource_id, owner_id, reader_ids"),
    "load access",
  )
  if (!access) throw new PrivacyError("privacy_state_unavailable")
  store.access = new Map(
    access.map((row) => [row.resource_id, { ownerId: row.owner_id, readerIds: row.reader_ids }]),
  )
  const privacyRows = check(
    await supabase.from("session_privacy").select("session_id, paused, version"),
    "load privacy state",
  )
  if (!privacyRows) throw new PrivacyError("privacy_state_unavailable")

  const since = state.lastSync ?? "1970-01-01T00:00:00Z"
  const [maps, sessions, ids, status] = await Promise.all([
    supabase.from("work_maps").select("id, data, updated_at").gt("updated_at", since),
    supabase.from("capture_sessions").select("id, data, updated_at").gt("updated_at", since),
    supabase.from("work_maps").select("id"),
    supabase.from("app_state").select("data").eq("key", "capture_status").maybeSingle(),
  ])
  let latest = state.lastSync
  let mapsChanged = false
  let sessionsChanged = false

  for (const row of check(maps, "load workflows") as Row<WorkMap>[]) {
    latest = max(latest, row.updated_at)
    const json = stable(row.data)
    if (state.hashes.work_maps.get(row.id) === json) continue
    state.hashes.work_maps.set(row.id, json)
    mapsChanged = true
    const i = store.workMaps.findIndex((m) => m.id === row.id)
    if (i === -1) store.workMaps.push(row.data)
    else store.workMaps[i] = row.data
  }
  // Drafts merged into a saved map get deleted; drop them here too.
  const live = new Set((check(ids, "list workflows") as { id: string }[]).map((r) => r.id))
  for (const id of state.hashes.work_maps.keys()) {
    if (live.has(id)) continue
    state.hashes.work_maps.delete(id)
    store.workMaps = store.workMaps.filter((m) => m.id !== id)
  }
  if (mapsChanged) store.workMaps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  for (const row of check(sessions, "load sessions") as Row<StoredSession>[]) {
    latest = max(latest, row.updated_at)
    const json = stable(row.data)
    if (state.hashes.capture_sessions.get(row.id) === json) continue
    state.hashes.capture_sessions.set(row.id, json)
    // Keep this process's in-flight work (vision call, focus lookups) if we already hold the session.
    const local = store.sessions.get(row.id)
    store.sessions.set(row.id, {
      ...row.data,
      visionBusy: local?.visionBusy ?? false,
      pendingFocus: local?.pendingFocus ?? new Set(),
      privacyVersion: row.data.privacyVersion ?? 0,
      privacyController: local?.privacyController,
    })
    sessionsChanged = true
  }
  if (sessionsChanged) {
    // The session list relies on insertion order (oldest first).
    store.sessions = new Map(
      [...store.sessions].sort(([, a], [, b]) =>
        a.session.startedAt.localeCompare(b.session.startedAt),
      ),
    )
  }
  for (const row of privacyRows) {
    const runtime = store.sessions.get(row.session_id)
    if (!runtime) continue
    if (row.paused || runtime.privacyVersion !== row.version) {
      runtime.privacyController?.abort()
      runtime.pendingErp = []
      runtime.lastScreen = undefined
    }
    runtime.privacyVersion = row.version
    runtime.session.offTheRecord = row.paused
  }

  const statusRow = check(status, "load capture status") as { data: CaptureStatus } | null
  if (statusRow) {
    const json = stable(statusRow.data)
    if (json !== state.captureStatusHash) {
      state.captureStatusHash = json
      store.captureStatus = statusRow.data
    }
  }
  state.lastSync = latest
}

interface Row<T> {
  id: string
  data: T
  updated_at: string
}

const max = (a: string | undefined, b: string) => (a && a > b ? a : b)

/** Write everything that changed in memory since the last sync. */
async function push(supabase: SupabaseClient) {
  const writes: PromiseLike<unknown>[] = []
  if (store.access.size)
    check(
      await supabase.from("resource_access").upsert(
        [...store.access].map(([resource_id, access]) => ({
          resource_id,
          owner_id: access.ownerId,
          reader_ids: access.readerIds,
        })),
        { onConflict: "resource_id", ignoreDuplicates: true },
      ),
      "save access",
    )
  const newSessions = [...store.sessions.keys()].map((session_id) => ({ session_id }))
  if (newSessions.length)
    check(
      await supabase
        .from("session_privacy")
        .upsert(newSessions, { onConflict: "session_id", ignoreDuplicates: true }),
      "initialize privacy state",
    )

  const changed = <T>(table: Table, items: [string, string, T][]) => {
    const rows = items
      .filter(([id, json]) => state.hashes[table].get(id) !== json)
      .map(([id, , data]) => {
        return { id, data }
      })
    const removed = [...state.hashes[table].keys()].filter(
      (id) => !items.some(([itemId]) => itemId === id),
    )
    for (const id of removed) state.hashes[table].delete(id)
    if (rows.length)
      writes.push(
        supabase
          .from(table)
          .upsert(rows)
          .then((r) => {
            check(r, table)
            rows.forEach((row) => state.hashes[table].set(row.id, stable(row.data)))
          }),
      )
    if (removed.length) {
      writes.push(
        supabase
          .from(table)
          .delete()
          .in("id", removed)
          .then((r) => check(r, `delete ${table}`)),
      )
    }
  }

  changed(
    "work_maps",
    store.workMaps.map((m) => [m.id, stable(m), m]),
  )
  for (const [id, runtime] of store.sessions) {
    const row = persisted(runtime)
    const json = stable(row)
    if (state.hashes.capture_sessions.get(id) === json) continue
    writes.push(
      supabase
        .rpc("commit_capture_runtime", {
          p_session: id,
          p_version: runtime.privacyVersion,
          p_data: row,
        })
        .then((result) => {
          const committed = check(result, "save protected session")
          if (committed) state.hashes.capture_sessions.set(id, json)
        }),
    )
  }

  const statusJson = stable(store.captureStatus)
  if (statusJson !== state.captureStatusHash) {
    writes.push(
      supabase
        .from("app_state")
        .upsert({ key: "capture_status", data: store.captureStatus })
        .then((r) => {
          check(r, "capture status")
          state.captureStatusHash = statusJson
        }),
    )
  }

  for (const [id, frame] of store.frames) {
    if (state.uploadedFrames.has(id)) continue
    assertProcessedImage(frame.data)
    if (frame.privacy.policyVersion !== PRIVACY_POLICY)
      throw new PrivacyError("privacy_unprocessed_image")
    writes.push(
      (async () => {
        const epoch = check(
          await supabase
            .from("session_privacy")
            .select("paused, version")
            .eq("session_id", frame.sessionId)
            .single(),
          "check frame privacy",
        )
        if (!epoch) throw new PrivacyError("privacy_state_unavailable")
        if (epoch.paused || epoch.version !== frame.privacyVersion) {
          store.frames.delete(id)
          store.frameMetadata.delete(id)
          return
        }
        check(
          await supabase.storage
            .from(FRAME_BUCKET)
            .upload(id, frame.data, { contentType: frame.mime, upsert: true }),
          "upload protected frame",
        )
        const metadata = store.frameMetadata.get(id)!
        const committed = check(
          await supabase.rpc("commit_redacted_frame", {
            p_id: id,
            p_session: frame.sessionId,
            p_version: frame.privacyVersion,
            p_data: metadata,
          }),
          "commit protected frame",
        )
        if (!committed) {
          check(await supabase.storage.from(FRAME_BUCKET).remove([id]), "discard paused frame")
          store.frames.delete(id)
          store.frameMetadata.delete(id)
        } else state.uploadedFrames.add(id)
      })(),
    )
  }

  await Promise.all(writes)

  // Uploaded frames don't need to stay in memory, except each session's last one (next tick's "previous").
  const keep = new Set([...store.sessions.values()].map((r) => r.lastFrameId))
  for (const id of store.frames.keys()) {
    if (keep.has(id)) continue
    store.frames.delete(id)
    state.uploadedFrames.delete(id)
  }
}

/** Run one request against the store, synced with Supabase on both ends. */
export async function withDb<T>(mutates: boolean, run: () => Promise<T>): Promise<T> {
  const supabase = db()
  if (!supabase) return run()
  state.inFlight += 1
  try {
    await pull(supabase)
    const result = await run()
    if (mutates) await push(supabase)
    return result
  } finally {
    state.inFlight -= 1
  }
}

/** Frame bytes from memory, or from Storage once it's been uploaded. */
export async function loadFrame(id: string) {
  const inMemory = store.frames.get(id)
  if (inMemory) {
    assertProcessedImage(inMemory.data)
    return inMemory
  }
  const supabase = db()
  if (!supabase) return undefined
  const metadata = await supabase.from("frame_metadata").select("data").eq("id", id).maybeSingle()
  if (
    metadata.error ||
    !metadata.data ||
    metadata.data.data.privacy?.policyVersion !== PRIVACY_POLICY
  )
    return undefined
  const { data, error } = await supabase.storage.from(FRAME_BUCKET).download(id)
  if (error || !data) return undefined
  const frame = { ...metadata.data.data, data: Buffer.from(await data.arrayBuffer()) } as Frame
  registerProcessedFrame(frame)
  return frame
}
