import { BookOpenText, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState } from "@/components/query-state"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { WorkMapStatus } from "@/lib/api"

import { WorkMapCard } from "./components/work-map-card"
import { useWorkMaps } from "./hooks"
import { STATUS } from "./labels"

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
        title="Work Maps"
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
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<BookOpenText />} title="No work maps found">
          {data.length === 0
            ? "Captured sessions turn into work maps here."
            : "Try a different search or filter."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => (
            <WorkMapCard key={m.id} workMap={m} />
          ))}
        </div>
      )}
    </div>
  )
}
