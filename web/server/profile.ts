import type { User } from "@supabase/supabase-js"
import { z } from "zod"

import type { Person, Profile, ProfilePatch } from "../src/lib/api/types.js"
import { db } from "./db.js"
import { HttpError } from "./store.js"

/**
 * The signed-in user's profile (`profiles` table, created by a trigger on sign-up).
 * Onboarding will fill `role` and `preferences` and set `onboarded_at`.
 * Without Supabase there's no login, so everyone shares one local profile.
 */

let localProfile: Profile = {
  id: "p-local",
  displayName: process.env.SOCRATES_DEV_USER || "You",
  preferences: {},
  onboarded: false,
}

interface ProfileRow {
  id: string
  display_name: string
  role: string | null
  preferences: Profile["preferences"] | null
  onboarded_at: string | null
}

const fromRow = (row: ProfileRow, user: User): Profile => ({
  id: row.id,
  displayName: row.display_name,
  role: row.role ?? undefined,
  email: user.email,
  preferences: row.preferences ?? {},
  onboarded: row.onboarded_at !== null,
})

const Patch = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    role: z.string().trim().max(80),
    preferences: z.object({ chattiness: z.enum(["quiet", "normal", "curious"]) }).partial(),
  })
  .partial()

export async function getProfile(user: User | undefined): Promise<Profile> {
  const supabase = db()
  if (!supabase || !user) return localProfile

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, preferences, onboarded_at")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>()
  if (error) throw new Error(`Supabase load profile: ${error.message}`)
  if (data) return fromRow(data, user)

  // Accounts created before the sign-up trigger existed have no row yet.
  const name = (user.user_metadata.display_name as string | undefined) ?? user.email?.split("@")[0]
  const created = await supabase
    .from("profiles")
    .insert({ id: user.id, display_name: name || "You" })
    .select("id, display_name, role, preferences, onboarded_at")
    .single<ProfileRow>()
  if (created.error) throw new Error(`Supabase create profile: ${created.error.message}`)
  return fromRow(created.data, user)
}

export async function updateProfile(user: User | undefined, input: unknown): Promise<Profile> {
  const parsed = Patch.safeParse(input)
  if (!parsed.success) throw new HttpError(400, parsed.error.message)
  const patch: ProfilePatch = parsed.data

  const current = await getProfile(user)
  const preferences = { ...current.preferences, ...patch.preferences }
  const supabase = db()
  if (!supabase || !user) {
    localProfile = { ...localProfile, ...patch, preferences }
    return localProfile
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...(patch.displayName !== undefined && { display_name: patch.displayName }),
      ...(patch.role !== undefined && { role: patch.role || null }),
      preferences,
    })
    .eq("id", user.id)
    .select("id, display_name, role, preferences, onboarded_at")
    .single<ProfileRow>()
  if (error) throw new Error(`Supabase update profile: ${error.message}`)
  return fromRow(data, user)
}

/** The signed-in user as the expert of a session they record (the form can override name/role). */
export async function personForUser(user: User, name: string, role: string): Promise<Person> {
  const profile = await getProfile(user)
  return {
    id: profile.id,
    name: name.trim() || profile.displayName,
    role: role.trim() || profile.role || "Expert",
  }
}
