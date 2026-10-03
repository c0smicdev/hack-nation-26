import { useEffect } from "react"
import { useNavigate } from "react-router"

import { paths } from "@/app/paths"
import { ACCOUNTS, eur, net } from "@/lib/erp/data"
import { cn } from "@/lib/utils"

import { ErpStatus } from "./erp-layout"
import { type Dataset, useErp } from "./erp-state"

const DATASETS: { value: Dataset; label: string }[] = [
  { value: "batch", label: "Month-end batch" },
  { value: "training", label: "Training cases" },
]

export function InvoiceListPage() {
  const { invoices, dataset, setDataset, send } = useErp()
  const navigate = useNavigate()
  const rows = invoices.filter((inv) => inv.set === dataset)

  useEffect(() => {
    send({ type: "screen", screen: "Invoice list" })
  }, [send])

  return (
    <div className="rounded border border-slate-300 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-300 bg-slate-50 px-3 py-2">
        <h1 className="font-semibold">Incoming invoices</h1>
        <div className="ml-4 flex rounded border border-slate-300 bg-white">
          {DATASETS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDataset(d.value)}
              className={cn(
                "px-3 py-1",
                dataset === d.value
                  ? "bg-[#1d3557] text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500">
          {rows.length} invoices · sorted by due date
        </span>
      </div>
      <table className="w-full">
        <thead className="bg-slate-100 text-left text-xs text-slate-600">
          <tr>
            {[
              "Invoice",
              "Supplier",
              "Description",
              "Invoice date",
              "Due",
              "Net amount",
              "Account",
              "Status",
            ].map((h) => (
              <th key={h} className="border-b border-slate-300 px-3 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows]
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .map((inv) => (
              <tr
                key={inv.id}
                onClick={() => navigate(paths.erpInvoice(inv.id))}
                className="cursor-pointer border-b border-slate-200 hover:bg-sky-50"
              >
                <td className="px-3 py-2 font-mono text-sky-800 underline">{inv.id}</td>
                <td className="px-3 py-2">{inv.supplier.name}</td>
                <td className="px-3 py-2 text-slate-600">{inv.description}</td>
                <td className="px-3 py-2 tabular-nums">{inv.invoiceDate}</td>
                <td className="px-3 py-2 tabular-nums">{inv.dueDate}</td>
                <td className="px-3 py-2 text-right tabular-nums">{eur(net(inv))}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {ACCOUNTS[inv.account]?.split(" · ")[0]}
                </td>
                <td className="px-3 py-2">
                  <ErpStatus status={inv.status} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
