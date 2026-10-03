import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { Person } from "@/lib/api"
import { initials } from "@/lib/format"

export function Expert({ person, showRole = false }: { person: Person; showRole?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7">
        <AvatarFallback className="text-xs">{initials(person.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium">{person.name}</p>
        {showRole && <p className="truncate text-xs text-muted-foreground">{person.role}</p>}
      </div>
    </div>
  )
}
