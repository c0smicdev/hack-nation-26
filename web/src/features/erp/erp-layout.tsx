import { GraduationCap, RotateCcw } from "lucide-react"
import { useEffect } from "react"
import { Link, Outlet } from "react-router"

import { paths } from "@/app/paths"
import { cn } from "@/lib/utils"

import { ErpProvider, useErp } from "./erp-state"

/**
 * The mock ERP: a standalone "company system" the expert works in while
 * Socrates watches. It runs in its own tab, outside the Socrates shell.
 */
export function ErpLayout() {
  return (
    <ErpProvider>
      <ErpShell />
    </ErpProvider>
  )
}

function ErpShell() {
  const { gate, reset } = useErp()
  // Easy to find in the browser's "share a tab" picker.
  useEffect(() => {
    document.title = "Nordwind ERP"
  }, [])
  return (
    <div className="min-h-svh bg-slate-100 font-sans text-[13px] text-slate-900">
      <header className="flex h-11 items-center gap-6 bg-[#1d3557] px-4 text-white">
        <Link to={paths.erp()} className="font-semibold tracking-wide">
          NORDWIND <span className="font-normal text-sky-200">ERP</span>
        </Link>
        <nav className="flex gap-4 text-sky-100">
          <span className="border-b-2 border-sky-300 pb-0.5 text-white">Accounts payable</span>
          <span className="opacity-60">Purchasing</span>
          <span className="opacity-60">Assets</span>
          <span className="opacity-60">Reports</span>
        </nav>
        <div className="ml-auto flex items-center gap-4 text-xs text-sky-100">
          {gate && (
            <span className="flex items-center gap-1.5 rounded bg-emerald-500/20 px-2 py-1 text-emerald-200">
              <GraduationCap className="size-3.5" /> {gate.tutor} is reviewing saves
            </span>
          )}
          <span>Period 12/2026 · Company 1000</span>
          <button
            type="button"
            onClick={() => {
              if (confirm("Reset all demo invoices?")) reset()
            }}
            className="flex items-center gap-1 opacity-70 hover:opacity-100"
            title="Reset demo data"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  )
}

export function ErpStatus({ status }: { status: string }) {
  const style: Record<string, string> = {
    open: "bg-sky-100 text-sky-800",
    on_hold: "bg-amber-100 text-amber-800",
    awaiting_approval: "bg-violet-100 text-violet-800",
    posted: "bg-emerald-100 text-emerald-800",
  }
  const label: Record<string, string> = {
    open: "Open",
    on_hold: "On hold",
    awaiting_approval: "Awaiting approval",
    posted: "Posted",
  }
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", style[status])}>
      {label[status] ?? status}
    </span>
  )
}
