/**
 * Fake data for the mock ERP (our sandbox at /erp). Matches the workflow
 * fixtures: Sabine's month-end batch (4471–4474) and training cases she never
 * showed (4480–4483) for Teach.
 */

export type InvoiceStatus = "open" | "on_hold" | "awaiting_approval" | "posted"

export interface Supplier {
  id: string
  name: string
  city: string
  country: string
  /** Part of our group (e.g. the Czech subsidiary). */
  intercompany: boolean
}

export interface InvoiceLine {
  text: string
  amount: number
}

export interface Invoice {
  id: string
  set: "batch" | "training"
  supplier: Supplier
  iban: string
  contact: string
  invoiceDate: string
  dueDate: string
  description: string
  lines: InvoiceLine[]
  po: string
  goodsReceipt: string
  costCenter: string
  account: string
  assetNumber: string
  approver: string
  secondApprover: string
  note: string
  status: InvoiceStatus
}

/** Earlier, already-posted invoices; shown so duplicates are visible. */
export interface HistoryEntry {
  id: string
  supplierId: string
  date: string
  description: string
  amount: number
}

export const ACCOUNTS: Record<string, string> = {
  "4711": "4711 · Repairs & maintenance (opex)",
  "0400": "0400 · Technical equipment & machinery (capex)",
  "4730": "4730 · Freight & logistics (opex)",
  "4930": "4930 · Office supplies (opex)",
  "1590": "1590 · Intercompany clearing",
}

export const COST_CENTERS = [
  "2100 · Plant 2 machining",
  "2200 · Plant 2 assembly",
  "3100 · Logistics",
  "9100 · Administration",
]

export const APPROVERS = [
  "Sabine Keller (AP lead)",
  "Thomas Schäfer (Controller)",
  "Group accounting (Plzeň)",
  "Fixed-asset accounting",
]

const hartmann: Supplier = {
  id: "SUP-20817",
  name: "Hartmann Präzisionstechnik GmbH",
  city: "Augsburg",
  country: "DE",
  intercompany: false,
}
const nordwind: Supplier = {
  id: "SUP-40112",
  name: "Nordwind Components s.r.o.",
  city: "Plzeň",
  country: "CZ",
  intercompany: true,
}
const weber: Supplier = {
  id: "SUP-11873",
  name: "Weber Logistik GmbH",
  city: "Regensburg",
  country: "DE",
  intercompany: false,
}
const schulz: Supplier = {
  id: "SUP-30290",
  name: "Schulz Bürobedarf GmbH",
  city: "Munich",
  country: "DE",
  intercompany: false,
}
const kroeger: Supplier = {
  id: "SUP-30551",
  name: "Kröger Hydraulik GmbH",
  city: "Hamburg",
  country: "DE",
  intercompany: false,
}

const blank = {
  assetNumber: "",
  approver: "",
  secondApprover: "",
  note: "",
  status: "open" as const,
}

export const INITIAL_INVOICES: Invoice[] = [
  {
    ...blank,
    id: "4471",
    set: "batch",
    supplier: hartmann,
    iban: "DE89 3704 0044 0532 0130 00",
    contact: "m.hartmann@hartmann-praezision.de",
    invoiceDate: "2026-12-14",
    dueDate: "2026-12-29",
    description: "CNC spindle replacement, machining center MC-4",
    lines: [
      { text: "Spindle unit HSK-A63, 18,000 rpm", amount: 7200 },
      { text: "Installation and calibration", amount: 650 },
    ],
    po: "PO-55102",
    goodsReceipt: "GR-88213",
    costCenter: "2100 · Plant 2 machining",
    account: "4711",
  },
  {
    ...blank,
    id: "4472",
    set: "batch",
    supplier: nordwind,
    iban: "CZ65 0800 0000 1920 0014 5399",
    contact: "ucetni@nordwind-components.cz",
    invoiceDate: "2026-12-15",
    dueDate: "2026-12-30",
    description: "Machined housings, batch 12/26",
    lines: [{ text: "Housing NW-220, 240 pcs", amount: 3480 }],
    po: "PO-55131",
    goodsReceipt: "GR-88240",
    costCenter: "2200 · Plant 2 assembly",
    account: "1590",
  },
  {
    ...blank,
    id: "4473",
    set: "batch",
    supplier: weber,
    iban: "DE12 7505 0000 0012 3456 78",
    contact: "buchhaltung@weber-logistik.de",
    invoiceDate: "2026-12-16",
    dueDate: "2026-12-30",
    description: "Freight Plzeň → Augsburg, week 49",
    lines: [{ text: "FTL transport, 2 trucks", amount: 2960 }],
    po: "PO-55090",
    goodsReceipt: "GR-88199",
    costCenter: "3100 · Logistics",
    account: "4730",
  },
  {
    ...blank,
    id: "4474",
    set: "batch",
    supplier: schulz,
    iban: "DE44 7002 0270 0015 7788 99",
    contact: "rechnung@schulz-buero.de",
    invoiceDate: "2026-12-17",
    dueDate: "2027-01-15",
    description: "Office supplies, December",
    lines: [{ text: "Paper, toner, folders", amount: 312.4 }],
    po: "PO-55160",
    goodsReceipt: "GR-88275",
    costCenter: "9100 · Administration",
    account: "4930",
  },
  {
    ...blank,
    id: "4480",
    set: "training",
    supplier: kroeger,
    iban: "DE02 2004 1111 0123 4567 00",
    contact: "invoices@kroeger-hydraulik.de",
    invoiceDate: "2026-12-18",
    dueDate: "2027-01-02",
    description: "Hydraulic pump unit for press line 3",
    lines: [
      { text: "Pump unit HP-220 incl. motor", amount: 11200 },
      { text: "Commissioning", amount: 700 },
    ],
    po: "PO-55190",
    goodsReceipt: "GR-88302",
    costCenter: "2200 · Plant 2 assembly",
    account: "4711",
  },
  {
    ...blank,
    id: "4481",
    set: "training",
    supplier: nordwind,
    iban: "CZ65 0800 0000 1920 0014 5399",
    contact: "ucetni@nordwind-components.cz",
    invoiceDate: "2026-12-18",
    dueDate: "2027-01-02",
    description: "Sample parts, prototype run",
    lines: [{ text: "Prototype brackets, 40 pcs", amount: 640 }],
    po: "PO-55188",
    goodsReceipt: "GR-88297",
    costCenter: "2200 · Plant 2 assembly",
    account: "1590",
  },
  {
    ...blank,
    id: "4482",
    set: "training",
    supplier: weber,
    iban: "DE12 7505 0000 0012 3456 78",
    contact: "buchhaltung@weber-logistik.de",
    invoiceDate: "2026-12-19",
    dueDate: "2027-01-03",
    description: "Freight Augsburg → Plzeň, week 50",
    lines: [{ text: "FTL transport, 1 truck", amount: 1980 }],
    po: "PO-55120",
    goodsReceipt: "GR-88230",
    costCenter: "3100 · Logistics",
    account: "4730",
  },
  {
    ...blank,
    id: "4483",
    set: "training",
    supplier: hartmann,
    iban: "DE89 3704 0044 0532 0130 00",
    contact: "m.hartmann@hartmann-praezision.de",
    invoiceDate: "2026-12-19",
    dueDate: "2027-01-03",
    description: "Spindle bearing set, MC-2",
    lines: [{ text: "Bearing set HSK-A63", amount: 3100 }],
    po: "PO-55185",
    goodsReceipt: "GR-88290",
    costCenter: "2100 · Plant 2 machining",
    account: "4711",
  },
]

export const HISTORY: HistoryEntry[] = [
  {
    id: "4419",
    supplierId: weber.id,
    date: "2026-12-02",
    description: "Freight Plzeň → Augsburg, week 49",
    amount: 2960,
  },
  {
    id: "4467",
    supplierId: weber.id,
    date: "2026-12-12",
    description: "Freight Augsburg → Plzeň, week 50",
    amount: 1980,
  },
  {
    id: "4402",
    supplierId: hartmann.id,
    date: "2026-11-20",
    description: "Tool holders",
    amount: 860,
  },
  {
    id: "4388",
    supplierId: nordwind.id,
    date: "2026-11-18",
    description: "Housings, batch 11/26",
    amount: 3320,
  },
]

export const net = (invoice: Invoice) => invoice.lines.reduce((sum, line) => sum + line.amount, 0)

export const eur = (amount: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount)

/** What Socrates sees when the ERP asks before saving. Labels, not ids, so the model can reason. */
export function invoiceRecord(invoice: Invoice) {
  return {
    invoice: invoice.id,
    supplier: `${invoice.supplier.name} (${invoice.supplier.id}, ${invoice.supplier.city}, ${invoice.supplier.country})`,
    intercompany: invoice.supplier.intercompany,
    invoiceDate: invoice.invoiceDate,
    description: invoice.description,
    lines: invoice.lines.map((l) => `${l.text}: ${eur(l.amount)}`),
    netAmount: eur(net(invoice)),
    po: invoice.po,
    goodsReceipt: invoice.goodsReceipt,
    costCenter: invoice.costCenter,
    account: ACCOUNTS[invoice.account] ?? invoice.account,
    assetNumber: invoice.assetNumber || "(empty)",
    approver: invoice.approver || "(none)",
    secondApprover: invoice.secondApprover || "(none)",
    note: invoice.note || "(empty)",
    earlierInvoicesFromSupplier: HISTORY.filter((h) => h.supplierId === invoice.supplier.id).map(
      (h) => `${h.id} on ${h.date}: ${h.description}, ${eur(h.amount)} (posted)`,
    ),
  }
}
