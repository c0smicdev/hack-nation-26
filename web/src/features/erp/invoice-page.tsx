import { ChevronLeft, GraduationCap, Loader2, ShieldAlert } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"

import { paths } from "@/app/paths"
import { ACTION_LABEL, type ErpAction } from "@/lib/erp/bridge"
import {
  ACCOUNTS,
  APPROVERS,
  COST_CENTERS,
  eur,
  HISTORY,
  type Invoice,
  invoiceRecord,
  net,
} from "@/lib/erp/data"
import { cn } from "@/lib/utils"

import { ErpStatus } from "./erp-layout"
import { useErp } from "./erp-state"

type EditableField =
  "costCenter" | "account" | "assetNumber" | "approver" | "secondApprover" | "note"

const FIELD_LABEL: Record<EditableField, string> = {
  costCenter: "Cost center",
  account: "Account",
  assetNumber: "Asset number",
  approver: "Approver",
  secondApprover: "Second approver",
  note: "Note",
}

/** Signals typing to Socrates so it never interrupts mid-entry. */
function useTypingSignal() {
  const { send } = useErp()
  const typing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return () => {
    if (!typing.current) {
      typing.current = true
      send({ type: "typing", active: true })
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      typing.current = false
      send({ type: "typing", active: false })
    }, 1500)
  }
}

export function InvoicePage() {
  const { invoiceId = "" } = useParams()
  const { invoices } = useErp()
  const invoice = invoices.find((inv) => inv.id === invoiceId)
  if (!invoice) {
    return (
      <p className="p-8 text-center text-slate-500">
        Invoice {invoiceId} not found. <Link to={paths.erp()}>Back to the list</Link>
      </p>
    )
  }
  return <InvoiceView key={invoice.id} invoice={invoice} />
}

function InvoiceView({ invoice }: { invoice: Invoice }) {
  const { update, send, save, gate } = useErp()
  const onType = useTypingSignal()
  const [checking, setChecking] = useState<ErpAction>()
  const [held, setHeld] = useState<string>()
  const amount = net(invoice)
  const history = HISTORY.filter((h) => h.supplierId === invoice.supplier.id)
  const locked = invoice.status === "posted"

  useEffect(() => {
    send({
      type: "screen",
      screen: `Invoice ${invoice.id} detail`,
      invoiceId: invoice.id,
    })
  }, [invoice.id, send])

  const label = (field: EditableField, value: string) =>
    field === "account" ? (ACCOUNTS[value] ?? value) : value || "(empty)"

  function change(field: EditableField, value: string) {
    const from = invoice[field]
    if (from === value) return
    update(invoice.id, { [field]: value })
    send({
      type: "field_change",
      invoiceId: invoice.id,
      field,
      label: FIELD_LABEL[field],
      from: label(field, from),
      to: label(field, value),
    })
  }

  async function act(action: ErpAction) {
    setHeld(undefined)
    setChecking(action)
    const result = await save(invoice, action, invoiceRecord({ ...invoice }))
    setChecking(undefined)
    if (!result.allowed) setHeld(result.message ?? "The tutor held this save.")
  }

  return (
    <div className="space-y-3">
      <Link
        to={paths.erp()}
        className="inline-flex items-center gap-1 text-sky-800 hover:underline"
      >
        <ChevronLeft className="size-4" /> Incoming invoices
      </Link>

      <div className="rounded border border-slate-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-300 bg-slate-50 px-3 py-2">
          <h1 className="text-base font-semibold">
            Invoice <span className="font-mono">{invoice.id}</span>
          </h1>
          <span className="text-slate-600">{invoice.supplier.name}</span>
          <ErpStatus status={invoice.status} />
          <div className="ml-auto flex gap-2">
            {(["hold", "request_approval", "post"] as const).map((action) => (
              <button
                key={action}
                type="button"
                disabled={locked || !!checking}
                onClick={() => act(action)}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-3 py-1 font-medium disabled:opacity-50",
                  action === "post"
                    ? "border-[#1d3557] bg-[#1d3557] text-white hover:bg-[#274b78]"
                    : "border-slate-400 bg-white hover:bg-slate-100",
                )}
              >
                {checking === action && <Loader2 className="size-3.5 animate-spin" />}
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        </div>

        {checking && gate && (
          <Banner tone="info" icon={<GraduationCap className="size-4" />}>
            {gate.tutor} is checking this before it's saved…
          </Banner>
        )}
        {held && (
          <Banner tone="warn" icon={<ShieldAlert className="size-4" />}>
            <strong>Save held by {gate?.tutor ?? "the tutor"}.</strong> {held}
          </Banner>
        )}

        <div className="grid gap-x-6 gap-y-4 p-4 md:grid-cols-3">
          <Section title="Supplier">
            <Row label="Name">{invoice.supplier.name}</Row>
            <Row label="Supplier ID">
              <span className="font-mono">{invoice.supplier.id}</span>
            </Row>
            <Row label="Location">
              {invoice.supplier.city}, {invoice.supplier.country}
              {invoice.supplier.intercompany && (
                <span className="ml-2 rounded bg-slate-200 px-1 text-[11px]">Group company</span>
              )}
            </Row>
            <Row label="IBAN">
              <span className="font-mono">{invoice.iban}</span>
            </Row>
            <Row label="Contact">{invoice.contact}</Row>
          </Section>

          <Section title="Invoice">
            <Row label="Invoice date">{invoice.invoiceDate}</Row>
            <Row label="Due date">{invoice.dueDate}</Row>
            <Row label="Description">{invoice.description}</Row>
            <Row label="Purchase order">
              <span className="font-mono">{invoice.po}</span>
            </Row>
            <Row label="Goods receipt">
              <span className="font-mono">{invoice.goodsReceipt}</span>
            </Row>
          </Section>

          <Section title="Earlier invoices from this supplier">
            {history.length === 0 ? (
              <p className="text-slate-500">None this quarter.</p>
            ) : (
              <ul className="space-y-1">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex justify-between gap-2 border-b border-dotted border-slate-200 pb-1"
                  >
                    <span>
                      <span className="font-mono">{h.id}</span> · {h.date}
                      <br />
                      <span className="text-slate-500">{h.description}</span>
                    </span>
                    <span className="tabular-nums">{eur(h.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Line items" className="md:col-span-2">
            <table className="w-full">
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.text} className="border-b border-slate-200">
                    <td className="py-1">{line.text}</td>
                    <td className="py-1 text-right tabular-nums">{eur(line.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1">Net amount</td>
                  <td className="py-1 text-right tabular-nums">{eur(amount)}</td>
                </tr>
                <tr className="text-slate-500">
                  <td>VAT 19%</td>
                  <td className="text-right tabular-nums">
                    {invoice.supplier.country === "DE" ? eur(amount * 0.19) : "reverse charge"}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section title="Account assignment">
            <Field label="Cost center">
              <Select
                value={invoice.costCenter}
                options={COST_CENTERS.map((c) => [c, c])}
                disabled={locked}
                onChange={(v) => change("costCenter", v)}
              />
            </Field>
            <Field label="Account">
              <Select
                value={invoice.account}
                options={Object.entries(ACCOUNTS)}
                disabled={locked}
                onChange={(v) => change("account", v)}
              />
            </Field>
            <Field label="Asset number">
              <TextInput
                value={invoice.assetNumber}
                placeholder="e.g. AN-30477"
                disabled={locked}
                onType={onType}
                onCommit={(v) => change("assetNumber", v)}
              />
            </Field>
          </Section>

          <Section title="Approval" className="md:col-span-2">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Approver">
                <Select
                  value={invoice.approver}
                  options={[["", "—"], ...APPROVERS.map((a) => [a, a] as [string, string])]}
                  disabled={locked}
                  onChange={(v) => change("approver", v)}
                />
              </Field>
              <Field label="Second approver">
                <Select
                  value={invoice.secondApprover}
                  options={[["", "—"], ...APPROVERS.map((a) => [a, a] as [string, string])]}
                  disabled={locked}
                  onChange={(v) => change("secondApprover", v)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Note">
            <TextInput
              multiline
              value={invoice.note}
              placeholder="Internal note"
              disabled={locked}
              onType={onType}
              onCommit={(v) => change("note", v)}
            />
          </Section>
        </div>
      </div>
    </div>
  )
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "info" | "warn"
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b px-3 py-2",
        tone === "info"
          ? "border-sky-200 bg-sky-50 text-sky-900"
          : "border-amber-300 bg-amber-50 text-amber-900",
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <p>{children}</p>
    </div>
  )
}

function Section({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <h2 className="border-b border-slate-300 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2">
      <span className="text-slate-500">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-slate-500">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  "w-full rounded border border-slate-400 bg-white px-2 py-1 focus:border-sky-600 focus:outline-none disabled:bg-slate-100"

function Select({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string
  options: [string, string][]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <select
      className={inputClass}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

/** Commits on blur / Enter, so Socrates sees one change, not every keystroke. */
function TextInput({
  value,
  placeholder,
  disabled,
  multiline,
  onType,
  onCommit,
}: {
  value: string
  placeholder?: string
  disabled?: boolean
  multiline?: boolean
  onType: () => void
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const props = {
    className: inputClass,
    value: draft,
    placeholder,
    disabled,
    onChange: (e: { target: { value: string } }) => {
      setDraft(e.target.value)
      onType()
    },
    onBlur: () => onCommit(draft.trim()),
  }
  return multiline ? (
    <textarea rows={3} {...props} />
  ) : (
    <input {...props} onKeyDown={(e) => e.key === "Enter" && onCommit(draft.trim())} />
  )
}
