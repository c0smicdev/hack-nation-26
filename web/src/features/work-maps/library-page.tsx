import { BookOpenText, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState } from "@/components/query-state"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { WorkMapStatus } from "@/lib/api"

import { NewWorkflowDialog } from "./components/new-workflow-dialog"
import { WorkMapCard } from "./components/work-map-card"
import { useWorkMaps } from "./hooks"
import { STATUS } from "./labels"

function AddWorkflowCard() {
  return (
    <NewWorkflowDialog
      trigger={
        <button
          type="button"
          className="group flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 text-primary transition-colors hover:border-primary hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-110">
            <Plus className="size-6" />
          </div>
          <span className="text-base font-semibold">New workflow</span>
        </button>
      }
    />
  )
}

type Filter = "all" | WorkMapStatus

export function LibraryPage() {
  const { data, isPending, isError, error, refetch } = useWorkMaps()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter(
      (m) =>
        (filter === "all" || m.status === filter) &&
        (!q ||
          [m.title, m.summary, m.domain, m.expert.name].some((s) => s.toLowerCase().includes(q))),
    )
  }, [data, query, filter])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Workflows"
        description="Short, interactive guides captured from your experts — every step, judgment call and guardrail, in their own words."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows, experts…"
            className="pl-8"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {(Object.keys(STATUS) as WorkMapStatus[]).map((s) => (
              <TabsTrigger key={s} value={s}>
                {s === "confirmed" ? "Confirmed" : STATUS[s].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isError ? (
        <ErrorState error={error} retry={refetch} />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AddWorkflowCard />
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AddWorkflowCard />
          {visible.map((m) => (
            <WorkMapCard key={m.id} workMap={m} />
          ))}
        </div>
      )}

      {!isPending && !isError && visible.length === 0 && (
        <EmptyState icon={<BookOpenText />} title="No workflows found">
          {data.length === 0
            ? "Captured sessions turn into workflows here."
            : "Try a different search or filter."}
        </EmptyState>
      )}
    </div>
  )
}
