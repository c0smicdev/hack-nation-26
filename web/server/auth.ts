import { db } from "./db.js"
import { HttpError } from "./store.js"

/** Rejects requests without a valid Supabase session. Open when Supabase isn't configured. */
export async function requireUser(request: Request) {
  const supabase = db()
  if (!supabase) return
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) throw new HttpError(401, "Not signed in")
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, "Session expired, please sign in again")
  return data.user
}
