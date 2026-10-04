import { ChevronRight, GraduationCap } from "lucide-react"
import { Link } from "react-router"

import { paths } from "@/app/paths"
import { PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState } from "@/components/query-state"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { pluralize } from "@/lib/format"

import { useConfirmedWorkMaps } from "./hooks"

export function TeachPage() {
  const maps = useConfirmedWorkMaps()
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Teach"
        description="Pick a confirmed workflow. Socrates guides a new hire through real cases in the ERP by voice, in the expert's words, and stops them before a wrong decision is saved."
      />
      {maps.isError ? (
        <ErrorState error={maps.error} retry={maps.refetch} />
      ) : !maps.data ? (
        <Skeleton className="h-48" />
      ) : maps.data.length === 0 ? (
        <EmptyState icon={<GraduationCap />} title="Nothing to teach yet">
          Capture a workflow and confirm the teach-back first.
        </EmptyState>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {maps.data.map((m) => (
              <li key={m.id}>
                <Link
                  to={paths.teach(m.id)}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <GraduationCap className="size-5 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {m.expert.name} · {m.domain} · {pluralize(m.judgmentCount, "judgment call")} ·{" "}
                      {pluralize(m.guardrailCount, "guardrail")}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
