import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { CaptureStatus, WorkMap } from "../src/lib/api/types.js"
import { type SessionRuntime, store } from "./store.js"

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

// visionBusy is per-request state; persisting it could leave a session stuck.
const sessionJson = (runtime: SessionRuntime) => JSON.stringify({ ...runtime, visionBusy: false })

/**
 * Pull rows other instances changed. Only runs while no other request is in
 * flight here, so it never swaps out an object a running handler still holds.
 */
async function pull(supabase: SupabaseClient) {
  if (state.inFlight > 1) return

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

  for (const row of check(maps, "load work maps") as Row<WorkMap>[]) {
    latest = max(latest, row.updated_at)
    const json = JSON.stringify(row.data)
    if (state.hashes.work_maps.get(row.id) === json) continue
    state.hashes.work_maps.set(row.id, json)
    mapsChanged = true
    const i = store.workMaps.findIndex((m) => m.id === row.id)
    if (i === -1) store.workMaps.push(row.data)
    else store.workMaps[i] = row.data
  }
  // Drafts merged into a saved map get deleted; drop them here too.
  const live = new Set((check(ids, "list work maps") as { id: string }[]).map((r) => r.id))
  for (const id of state.hashes.work_maps.keys()) {
    if (live.has(id)) continue
    state.hashes.work_maps.delete(id)
    store.workMaps = store.workMaps.filter((m) => m.id !== id)
  }
  if (mapsChanged) store.workMaps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  for (const row of check(sessions, "load sessions") as Row<SessionRuntime>[]) {
    latest = max(latest, row.updated_at)
    const runtime = { ...row.data, visionBusy: false }
    const json = sessionJson(runtime)
    if (state.hashes.capture_sessions.get(row.id) === json) continue
    state.hashes.capture_sessions.set(row.id, json)
    store.sessions.set(row.id, runtime)
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

  const statusRow = check(status, "load capture status") as { data: CaptureStatus } | null
  if (statusRow) {
    const json = JSON.stringify(statusRow.data)
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

  const changed = <T>(table: Table, items: [string, string, T][]) => {
    const rows = items
      .filter(([id, json]) => state.hashes[table].get(id) !== json)
      .map(([id, json, data]) => {
        state.hashes[table].set(id, json)
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
          .then((r) => check(r, table)),
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
    store.workMaps.map((m) => [m.id, JSON.stringify(m), m]),
  )
  changed(
    "capture_sessions",
    [...store.sessions].map(([id, runtime]) => [
      id,
      sessionJson(runtime),
      { ...runtime, visionBusy: false },
    ]),
  )

  const statusJson = JSON.stringify(store.captureStatus)
  if (statusJson !== state.captureStatusHash) {
    state.captureStatusHash = statusJson
    writes.push(
      supabase
        .from("app_state")
        .upsert({ key: "capture_status", data: store.captureStatus })
        .then((r) => check(r, "capture status")),
    )
  }

  for (const [id, frame] of store.frames) {
    if (state.uploadedFrames.has(id)) continue
    state.uploadedFrames.add(id)
    writes.push(
      supabase.storage
        .from(FRAME_BUCKET)
        .upload(id, frame.data, { contentType: frame.mime, upsert: true })
        .then((r) => check(r, `upload frame ${id}`)),
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
  if (inMemory) return inMemory
  const supabase = db()
  if (!supabase) return undefined
  const { data, error } = await supabase.storage.from(FRAME_BUCKET).download(id)
  if (error || !data) return undefined
  return { data: Buffer.from(await data.arrayBuffer()), mime: data.type || "image/jpeg" }
}
