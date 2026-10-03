import { Landmark, MessageCircleQuestion } from "lucide-react"
import { Link, Outlet } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usingMocks } from "@/lib/api"

import { paths } from "./paths"

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
        {usingMocks && (
          <Badge variant="outline" className="text-muted-foreground">
            Mock data
          </Badge>
        )}
        <Button asChild variant="outline" className="ml-auto">
          <Link to={paths.ask()}>
            <MessageCircleQuestion />
            Ask Socrates
          </Link>
        </Button>
      </header>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
