import type { Session } from "@supabase/supabase-js"
import { useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useEffect, useMemo, useState } from "react"

import { AuthContext, type AuthState } from "./context"
import { supabase } from "./supabase"

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // Don't show one user's cached data to the next.
      if (event === "SIGNED_OUT") queryClient.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      async signIn(email, password) {
        const { error } = await supabase!.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signUp(email, password, displayName) {
        // The profiles trigger (supabase/schema.sql) copies display_name into the profile.
        const { data, error } = await supabase!.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName.trim() } },
        })
        if (error) throw error
        if (!data.session) throw new Error("Check your inbox to confirm your email, then sign in.")
      },
      async signOut() {
        await supabase?.auth.signOut()
      },
    }),
    [ready, session],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
