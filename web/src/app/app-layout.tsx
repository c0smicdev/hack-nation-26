import { Landmark, MessageCircleQuestion } from "lucide-react"
import { Link, Outlet } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { AskPanel } from "@/features/ask/ask-panel"

import { paths } from "./paths"

const ASK_SUGGESTIONS = [
  "When is an invoice capex instead of opex?",
  "What do I do with an unknown supplier?",
  "Who approves intercompany invoices?",
]

export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-8">
        <Link to={paths.library()} className="flex items-center gap-2">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Landmark className="size-4" />
          </div>
          <span className="font-semibold">Socrates</span>
        </Link>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="ml-auto">
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
      </header>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
