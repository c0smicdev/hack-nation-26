import { Navigate, Outlet, useLocation } from "react-router"

import { useAuth } from "@/lib/auth/context"
import { authEnabled } from "@/lib/auth/supabase"

import { paths } from "./paths"

/** Wraps the Socrates shell. Without Supabase config (e.g. mock mode) it lets everyone through. */
export function RequireAuth() {
  const { ready, session } = useAuth()
  const location = useLocation()
  if (!authEnabled) return <Outlet />
  if (!ready) return null
  if (!session) return <Navigate to={paths.login()} replace state={{ from: location.pathname }} />
  return <Outlet />
}
