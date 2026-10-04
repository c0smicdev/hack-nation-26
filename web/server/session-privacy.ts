import { randomUUID } from "node:crypto"

import { db } from "./db.js"
import { PrivacyError } from "./privacy.js"
import type { SessionRuntime } from "./store.js"

interface Lease {
  id: string
  version: number
}

export async function claimCaptureJob(runtime: SessionRuntime): Promise<Lease | undefined> {
  if (runtime.session.offTheRecord || runtime.visionBusy) return undefined
  const id = randomUUID()
  const supabase = db()
  if (supabase) {
    const { data, error } = await supabase.rpc("claim_capture_job", {
      p_session: runtime.session.id,
      p_job: id,
    })
    if (error) throw new PrivacyError("privacy_state_unavailable")
    if (data === null) return undefined
    runtime.privacyVersion = Number(data)
  }
  runtime.visionBusy = true
  runtime.privacyController = new AbortController()
  return { id, version: runtime.privacyVersion }
}

export async function assertCaptureCurrent(runtime: SessionRuntime, lease: Lease) {
  if (
    runtime.session.offTheRecord ||
    runtime.session.status !== "live" ||
    runtime.privacyVersion !== lease.version ||
    runtime.privacyController?.signal.aborted
  ) {
    throw new PrivacyError("privacy_paused")
  }
  const supabase = db()
  if (supabase) {
    const { data, error } = await supabase
      .from("session_privacy")
      .select("paused, version, job_id, lease_until")
      .eq("session_id", runtime.session.id)
      .single()
    if (error) throw new PrivacyError("privacy_state_unavailable")
    if (
      data.paused ||
      data.version !== lease.version ||
      data.job_id !== lease.id ||
      Date.parse(data.lease_until) <= Date.now()
    )
      throw new PrivacyError("privacy_paused")
  }
}

export async function assertSessionVersion(runtime: SessionRuntime, version: number) {
  if (runtime.session.offTheRecord || runtime.privacyVersion !== version)
    throw new PrivacyError("privacy_paused")
  const supabase = db()
  if (supabase) {
    const { data, error } = await supabase
      .from("session_privacy")
      .select("paused, version")
      .eq("session_id", runtime.session.id)
      .single()
    if (error) throw new PrivacyError("privacy_state_unavailable")
    if (data.paused || data.version !== version) throw new PrivacyError("privacy_paused")
  }
}

export async function releaseCaptureJob(runtime: SessionRuntime, lease: Lease) {
  runtime.visionBusy = false
  runtime.privacyController = undefined
  const supabase = db()
  if (supabase) {
    const { error } = await supabase.rpc("release_capture_job", {
      p_session: runtime.session.id,
      p_job: lease.id,
    })
    if (error) throw new PrivacyError("privacy_state_unavailable")
  }
}

export async function setSessionPrivacy(runtime: SessionRuntime, paused: boolean) {
  // Stop this instance immediately; the authoritative version fences other instances.
  runtime.session.offTheRecord = true
  runtime.privacyVersion += 1
  runtime.privacyController?.abort()
  runtime.pendingErp = []
  runtime.lastScreen = undefined
  const supabase = db()
  if (supabase) {
    const { data, error } = await supabase.rpc("set_session_privacy", {
      p_session: runtime.session.id,
      p_paused: paused,
    })
    if (error) throw new PrivacyError("privacy_state_unavailable")
    runtime.privacyVersion = Number(data)
  }
  runtime.session.offTheRecord = paused
}
