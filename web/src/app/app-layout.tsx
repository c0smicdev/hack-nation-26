import { Landmark, LogIn, LogOut, MessageCircleQuestion } from "lucide-react"
import { Link, Outlet } from "react-router"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { AskPanel } from "@/features/ask/ask-panel"
import { useAuth } from "@/lib/auth/context"
import { useMe } from "@/lib/auth/hooks"
import { authEnabled } from "@/lib/auth/supabase"
import { initials } from "@/lib/format"

import { paths } from "./paths"

const ASK_SUGGESTIONS = [
  "When is an invoice capex instead of opex?",
  "What do I do with an unknown supplier?",
  "Who approves intercompany invoices?",
]

export function AppLayout() {
  const { session, signOut } = useAuth()
  const { data: me } = useMe()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-8">
        <Link to={paths.library()} className="flex items-center gap-2">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Landmark className="size-4" />
          </div>
          <span className="font-heading text-lg font-semibold text-primary">Socrates</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          {me && (
            <div className="flex items-center gap-2" title={me.email}>
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{initials(me.displayName)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{me.displayName}</span>
            </div>
          )}
          {session ? (
            <>
              <Button variant="outline" onClick={() => void signOut()}>
                <LogOut />
                Log out
              </Button>
            </>
          ) : (
            authEnabled && (
              <Button asChild>
                <Link to={paths.login()}>
                  <LogIn />
                  Log in
                </Link>
              </Button>
            )
          )}
        </div>
      </header>
      <main className="flex-1 p-4 pb-20 md:p-8 md:pb-20">
        <Outlet />
      </main>
      <Sheet>
        <SheetTrigger asChild>
          <Button size="lg" className="fixed right-4 bottom-4 z-40 rounded-full shadow-lg">
            <MessageCircleQuestion />
            Ask Socrates
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="pb-0">
            <SheetTitle>Ask Socrates</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 px-4 pb-4">
            <AskPanel suggestions={ASK_SUGGESTIONS} className="h-full" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
