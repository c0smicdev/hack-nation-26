import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
// Same rule as lib/api: mock mode never talks to a backend, so it needs no login.
const usingMocks = import.meta.env.MODE === "mock" || !import.meta.env.VITE_API_URL

/** Browser client (publishable key only). Null when login is off. */
export const supabase = url && key && !usingMocks ? createClient(url, key) : null

/** Login is required only when Supabase is configured and we use the real backend. */
export const authEnabled = supabase !== null

export async function accessToken() {
  if (!supabase) return undefined
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}
