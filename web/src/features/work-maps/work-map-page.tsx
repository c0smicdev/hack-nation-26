import { ChevronLeft, GraduationCap, MessageCircleQuestion, ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import { Link, useParams, useSearchParams } from "react-router"

import { paths } from "@/app/paths"
import { ErrorState } from "@/components/query-state"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { AskPanel } from "@/features/ask/ask-panel"
import type { ID, WorkMap } from "@/lib/api"
import { formatRelative, pluralize } from "@/lib/format"

import { DebriefSection } from "./components/debrief-section"
import { Expert } from "./components/expert"
import { Flowchart } from "./components/flowchart"
import { StatusBadge } from "./components/status-badge"
import { StepDetail } from "./components/step-detail"
import { StepTimeline } from "./components/step-timeline"
import { useWorkMap } from "./hooks"

export function WorkMapPage() {
  const { workMapId = "" } = useParams()
  const { data, isPending, isError, error, refetch } = useWorkMap(workMapId)

  if (isError) return <ErrorState error={error} retry={refetch} />
  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-[32rem]" />
      </div>
    )
  }
  return <WorkMapView workMap={data} />
}

function WorkMapView({ workMap }: { workMap: WorkMap }) {
  const { steps } = workMap
  const [searchParams, setSearchParams] = useSearchParams()

  // The selected step lives in the URL (?step=s4) so it can be linked to.
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === searchParams.get("step")),
  )
  const step = steps[activeIndex]
  const select = useCallback(
    (id: ID) => setSearchParams({ step: id }, { replace: true, preventScrollReset: true }),
    [setSearchParams],
  )
  const prev = activeIndex > 0 ? () => select(steps[activeIndex - 1].id) : undefined
  const next = activeIndex < steps.length - 1 ? () => select(steps[activeIndex + 1].id) : undefined

  // ← / → to move between steps.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]"))
        return
      if (e.key === "ArrowLeft" && activeIndex > 0) select(steps[activeIndex - 1].id)
      if (e.key === "ArrowRight" && activeIndex < steps.length - 1)
        select(steps[activeIndex + 1].id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeIndex, steps, select])

  const stepsRef = useRef<HTMLDivElement>(null)
  const selectFromChart = (id: ID) => {
    select(id)
    stepsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const judgmentCount = steps.filter((s) => s.kind === "judgment").length
  const guardrailCount = steps.reduce((n, s) => n + s.guardrails.length, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-4">
        <Link
          to={paths.library()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Work Maps
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={workMap.status} />
              <span className="text-sm text-muted-foreground">
                {workMap.domain} · updated {formatRelative(workMap.updatedAt)}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{workMap.title}</h1>
            <p className="text-muted-foreground">{workMap.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {workMap.status === "confirmed" && (
              <Button asChild>
                <Link to={paths.supervise(workMap.id)}>
                  <ShieldCheck /> Supervise a run
                </Link>
              </Button>
            )}
            {workMap.status === "confirmed" && (
              <Button variant="outline" asChild>
                <Link to={paths.teach(workMap.id)}>
                  <GraduationCap /> Teach a new hire
                </Link>
              </Button>
            )}
            <AskSheet workMap={workMap} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <Expert person={workMap.expert} showRole />
          <span>
            <span className="text-muted-foreground">When:</span> {workMap.trigger}
          </span>
          <span className="text-muted-foreground">
            {pluralize(steps.length, "step")} · {pluralize(judgmentCount, "judgment call")} ·{" "}
            {pluralize(guardrailCount, "guardrail")}
          </span>
        </div>
      </div>

      {step && (
        <div ref={stepsRef} className="grid scroll-mt-4 gap-8 lg:grid-cols-[17rem_1fr]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <StepTimeline steps={steps} activeId={step.id} onSelect={select} />
          </aside>
          <StepDetail
            step={step}
            index={activeIndex}
            total={steps.length}
            onPrev={prev}
            onNext={next}
          />
        </div>
      )}

      {steps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Flowchart</h2>
          <Flowchart workMap={workMap} onSelectStep={selectFromChart} />
        </section>
      )}

      <DebriefSection workMap={workMap} onSelectStep={select} />
    </div>
  )
}

function AskSheet({ workMap }: { workMap: WorkMap }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <MessageCircleQuestion /> Ask about this
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ask Socrates</SheetTitle>
          <SheetDescription>
            Answers come from {workMap.expert.name}'s own words in this workflow.
          </SheetDescription>
        </SheetHeader>
        <AskPanel
          workMapId={workMap.id}
          suggestions={[
            "When should I stop and ask someone?",
            ...workMap.steps
              .filter((s) => s.kind === "judgment")
              .slice(0, 2)
              .map((s) => `How do I ${s.title.charAt(0).toLowerCase()}${s.title.slice(1)}?`),
          ]}
          className="min-h-0 flex-1 px-4 pb-4"
        />
      </SheetContent>
    </Sheet>
  )
}
