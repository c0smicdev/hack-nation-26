import type { CaptureSession, Person, Rect, SessionEvent, WorkMap } from "../types"

/* People ------------------------------------------------------------ */

export const sabine: Person = {
  id: "p-sabine",
  name: "Sabine Keller",
  role: "Head of Accounts Payable",
}
const juergen: Person = {
  id: "p-juergen",
  name: "Jürgen Wolf",
  role: "Travel & Expense Controller",
}
const aylin: Person = {
  id: "p-aylin",
  name: "Aylin Demir",
  role: "Procurement Lead",
}

/* Screens (see public/mock/*.svg, 1280×800) ------------------------- */

const SCREEN = {
  list: "/mock/erp-invoice-list.svg",
  inv4471: "/mock/erp-invoice-4471.svg",
  inv4472: "/mock/erp-invoice-4472.svg",
  inv4473: "/mock/erp-invoice-4473.svg",
  expense: "/mock/erp-expense-report.svg",
}

const field = (col: 0 | 1 | 2, row: 0 | 1 | 2 | 3, span = 1): Rect => ({
  x: [0.222, 0.481, 0.741][col],
  y: [0.2175, 0.305, 0.3925, 0.48][row],
  width: span === 1 ? 0.234 : 0.494,
  height: 0.045,
})
const button = {
  hold: { x: 0.728, y: 0.1, width: 0.066, height: 0.045 },
  approve: { x: 0.8016, y: 0.1, width: 0.117, height: 0.045 },
  post: { x: 0.9266, y: 0.1, width: 0.0547, height: 0.045 },
}
/** IBAN + supplier contact on every invoice screen. */
const invoicePii: Rect[] = [field(0, 3), field(1, 3, 2)]

/* Work Maps --------------------------------------------------------- */

const AP_SESSION = "ses-0412"

export const workMaps: WorkMap[] = [
  {
    id: "wm-ap-month-end",
    title: "Process supplier invoices before month-end close",
    summary:
      "Clear the open AP inbox so every invoice due before the close is coded, approved and posted — without booking anything that will bounce back from the auditors.",
    domain: "Accounts payable",
    trigger:
      "Last three working days of every month, or when the AP inbox has invoices due before the close.",
    expert: sabine,
    status: "confirmed",
    updatedAt: "2026-10-02T16:40:00Z",
    sessionIds: [AP_SESSION],
    steps: [
      {
        id: "s1",
        title: "Sort the AP inbox by due date",
        kind: "routine",
        screen: {
          sessionId: AP_SESSION,
          at: 18,
          screenshotUrl: SCREEN.list,
          caption: "Invoice list, sorted by due date",
          focus: { x: 0.695, y: 0.19, width: 0.1, height: 0.035 },
        },
        decision: "Work top-down by due date instead of by arrival.",
        reason: {
          text: "Anything due before the close goes first. Everything else can wait until Monday.",
          speaker: sabine,
          source: "narration",
          at: 21,
        },
        guardrails: [],
        edgeCases: [],
      },
      {
        id: "s2",
        title: "Check the supplier is in the master data",
        kind: "routine",
        screen: {
          sessionId: AP_SESSION,
          at: 52,
          screenshotUrl: SCREEN.inv4471,
          caption: "Invoice 4471, supplier ID field",
          focus: field(1, 0),
          redactions: invoicePii,
        },
        decision: "Confirmed SUP-20817 is a verified supplier before touching anything else.",
        reason: {
          text: "If the supplier isn't verified, nothing else on the invoice matters. That's where fraud gets in.",
          speaker: sabine,
          source: "live_question",
          prompt: "You checked the supplier ID first. Why that before the amount?",
          at: 65,
        },
        guardrails: [
          {
            id: "g-unknown-supplier",
            kind: "stop_and_ask",
            rule: "Unknown or unverified supplier: stop and ask the controller. Never create the supplier yourself.",
            escalateTo: "Controller (Thomas Schäfer)",
            quote: {
              text: "New supplier, I don't touch it. That goes to Thomas, always.",
              speaker: sabine,
              source: "live_question",
              at: 71,
            },
          },
        ],
        edgeCases: [],
      },
      {
        id: "s3",
        title: "Match the invoice to PO and goods receipt",
        kind: "routine",
        screen: {
          sessionId: AP_SESSION,
          at: 100,
          screenshotUrl: SCREEN.inv4471,
          caption: "Invoice 4471, PO / goods receipt",
          focus: field(1, 1),
          redactions: invoicePii,
        },
        decision: "Three-way match: invoice amount, PO-55102 and goods receipt GR-88213 agree.",
        reason: {
          text: "No goods receipt means plant 2 hasn't confirmed delivery. Then we'd be paying for air.",
          speaker: sabine,
          source: "narration",
          at: 108,
        },
        guardrails: [],
        edgeCases: [
          {
            id: "e-price-deviation",
            when: "Net amount differs from the PO by more than 2%",
            then: "Don't post. Send it back to purchasing with the difference noted.",
            quote: {
              text: "Two percent on the net, not gross. Above that it goes back to purchasing.",
              speaker: sabine,
              source: "debrief",
              at: 702,
            },
          },
        ],
      },
      {
        id: "s4",
        title: "Code the invoice to a cost center",
        kind: "judgment",
        screen: {
          sessionId: AP_SESSION,
          at: 192,
          screenshotUrl: SCREEN.inv4471,
          caption: "Invoice 4471, cost center field",
          focus: field(0, 2),
          redactions: invoicePii,
        },
        decision: "Re-coded from opex (4711) to capex (0400).",
        reason: {
          text: "Equipment over €5,000 is always capex. The spindle is €7,200 on its own.",
          speaker: sabine,
          source: "live_question",
          prompt: "You moved that one to capex. What made you do that?",
          at: 195,
        },
        guardrails: [
          {
            id: "g-asset-number",
            kind: "limit",
            rule: "No asset number, no capex booking.",
            escalateTo: "Fixed-asset accounting",
            quote: {
              text: "If there's no asset number I can't book it as capex — I ask fixed assets to create one first.",
              speaker: sabine,
              source: "live_question",
              prompt: "Is there anything that would stop you booking it as capex?",
              at: 214,
            },
          },
        ],
        edgeCases: [
          {
            id: "e-under-threshold",
            when: "A machine part under €5,000",
            then: "Stays opex (4711), even though it's equipment.",
            quote: {
              text: "Under five thousand it's maintenance, even if it's a machine part.",
              speaker: sabine,
              source: "debrief",
              at: 690,
            },
          },
        ],
      },
      {
        id: "s5",
        title: "Send intercompany invoices for second approval",
        kind: "judgment",
        screen: {
          sessionId: AP_SESSION,
          at: 280,
          screenshotUrl: SCREEN.inv4472,
          caption: "Invoice 4472 from the Czech subsidiary",
          focus: button.approve,
          redactions: invoicePii,
        },
        decision: "Sent 4472 for second approval instead of posting it.",
        reason: {
          text: "Anything from Plzeň is intercompany. That always needs a second pair of eyes from group accounting.",
          speaker: sabine,
          source: "live_question",
          prompt: "That one went to approval instead of being posted. What's different about it?",
          at: 286,
        },
        guardrails: [
          {
            id: "g-intercompany",
            kind: "never",
            rule: "Never post an intercompany invoice on a single approval.",
            escalateTo: "Group accounting (T. Schäfer)",
            quote: {
              text: "Intercompany is never one signature. Never.",
              speaker: sabine,
              source: "live_question",
              at: 292,
            },
          },
        ],
        edgeCases: [],
      },
      {
        id: "s6",
        title: "Hold Weber Logistik's December invoice",
        kind: "judgment",
        screen: {
          sessionId: AP_SESSION,
          at: 365,
          screenshotUrl: SCREEN.inv4473,
          caption: "Invoice 4473, same amount and route as 4419",
          focus: button.hold,
          redactions: invoicePii,
        },
        decision: "Put 4473 on hold until it's checked against the freight log.",
        reason: {
          text: "Weber double-bills every December. I hold the second one until I've checked it against the freight log.",
          speaker: sabine,
          source: "debrief",
          prompt:
            "You held the December invoice. Is that for every supplier, and who decides when to release it?",
          at: 680,
        },
        guardrails: [
          {
            id: "g-release-hold",
            kind: "stop_and_ask",
            rule: "Don't release a held December invoice yourself — the AP lead decides.",
            escalateTo: "AP lead",
            quote: {
              text: "Only Weber, only December. And the release is my call — or whoever runs AP after me.",
              speaker: sabine,
              source: "debrief",
              at: 684,
            },
          },
        ],
        edgeCases: [
          {
            id: "e-other-suppliers",
            when: "Another supplier sends two similar invoices in December",
            then: "Process normally — the hold rule is specific to Weber Logistik.",
          },
        ],
      },
      {
        id: "s7",
        title: "Post the cleared invoices",
        kind: "routine",
        screen: {
          sessionId: AP_SESSION,
          at: 450,
          screenshotUrl: SCREEN.inv4471,
          caption: "Invoice 4471, Post",
          focus: button.post,
          redactions: invoicePii,
        },
        decision: "Posted 4471. 4472 waits for approval, 4473 stays on hold.",
        reason: {
          text: "Post what's clean today so the payment run on Friday picks it up.",
          speaker: sabine,
          source: "narration",
          at: 455,
        },
        guardrails: [],
        edgeCases: [],
      },
    ],
    debrief: [
      {
        id: "d1",
        question:
          "You held the December invoice. Is that for every supplier, and who decides when to release it?",
        answer: {
          text: "Only Weber, only December. And the release is my call — or whoever runs AP after me.",
          speaker: sabine,
          source: "debrief",
          at: 684,
        },
        resolved: true,
        stepId: "s6",
      },
      {
        id: "d2",
        question: "Is the 2% price tolerance on the net or the gross amount?",
        answer: {
          text: "Two percent on the net, not gross. Above that it goes back to purchasing.",
          speaker: sabine,
          source: "debrief",
          at: 702,
        },
        resolved: true,
        stepId: "s3",
      },
      {
        id: "d3",
        question: "What happens with a machine part under €5,000?",
        answer: {
          text: "Under five thousand it's maintenance, even if it's a machine part.",
          speaker: sabine,
          source: "debrief",
          at: 690,
        },
        resolved: true,
        stepId: "s4",
      },
    ],
    teachBack: {
      summary:
        "Sort by due date. For each invoice: verify the supplier first and stop if it's unknown, three-way match against PO and goods receipt, then code it — equipment over €5,000 goes to capex, but only with an asset number. Intercompany invoices from Plzeň always get a second approval. Weber Logistik's December invoices are held until checked against the freight log, and only the AP lead releases them. Post everything clean so Friday's payment run picks it up.",
      confirmed: true,
      corrections: [
        {
          text: "Small thing: the 2% tolerance is on the net amount, not gross.",
          speaker: sabine,
          source: "debrief",
          at: 760,
        },
      ],
    },
  },
  {
    id: "wm-expense-review",
    title: "Review travel expense reports",
    summary: "Check submitted travel expenses against the travel policy before they go to payroll.",
    domain: "Travel & expenses",
    trigger: "Whenever an expense report lands in the review queue.",
    expert: juergen,
    status: "in_debrief",
    updatedAt: "2026-10-03T09:12:00Z",
    sessionIds: ["ses-0415"],
    steps: [
      {
        id: "s1",
        title: "Check every receipt is attached",
        kind: "routine",
        screen: {
          sessionId: "ses-0415",
          at: 40,
          screenshotUrl: SCREEN.expense,
          caption: "Expense report 9012, receipts",
          focus: field(1, 1),
          redactions: [field(0, 0)],
        },
        decision: "9 of 9 receipts attached — continue.",
        guardrails: [],
        edgeCases: [],
      },
      {
        id: "s2",
        title: "Flag client dinners above the per-person limit",
        kind: "judgment",
        screen: {
          sessionId: "ses-0415",
          at: 132,
          screenshotUrl: SCREEN.expense,
          caption: "Expense report 9012, policy warning",
          focus: { x: 0.203, y: 0.845, width: 0.778, height: 0.125 },
          redactions: [field(0, 0)],
        },
        decision: "Asked the employee for the attendee list instead of rejecting.",
        reason: {
          text: "Above €80 a head we need names. Rejecting just makes them resubmit the same thing.",
          speaker: juergen,
          source: "live_question",
          prompt: "You didn't reject the dinner. Why ask for the list instead?",
          at: 140,
        },
        guardrails: [
          {
            id: "g-dinner-limit",
            kind: "limit",
            rule: "Client entertainment above €80 per person needs a named attendee list.",
          },
        ],
        edgeCases: [],
      },
      {
        id: "s3",
        title: "Approve and forward to payroll",
        kind: "routine",
        screen: {
          sessionId: "ses-0415",
          at: 210,
          screenshotUrl: SCREEN.expense,
          caption: "Expense report 9012, approver",
          focus: field(2, 2),
          redactions: [field(0, 0)],
        },
        decision: "Approved; payroll picks it up with the next salary run.",
        guardrails: [],
        edgeCases: [],
      },
    ],
    debrief: [
      {
        id: "d1",
        question: "Do foreign per diems follow the same rule as domestic ones?",
        resolved: false,
      },
      {
        id: "d2",
        question: "Who approves when the line manager is the one travelling?",
        resolved: false,
        stepId: "s3",
      },
    ],
  },
  {
    id: "wm-supplier-onboarding",
    title: "Onboard a new supplier",
    summary: "Verify a new supplier before their first invoice can be paid.",
    domain: "Procurement",
    trigger: "A purchase order names a supplier that isn't in the master data yet.",
    expert: aylin,
    status: "draft",
    updatedAt: "2026-10-03T11:02:00Z",
    sessionIds: ["ses-0418"],
    steps: [
      {
        id: "s1",
        title: "Look the supplier up in master data",
        kind: "routine",
        screen: {
          sessionId: "ses-0418",
          at: 25,
          screenshotUrl: SCREEN.inv4471,
          caption: "Supplier ID field",
          focus: field(1, 0),
          redactions: invoicePii,
        },
        decision: "Not found — start onboarding.",
        guardrails: [],
        edgeCases: [],
      },
    ],
    debrief: [],
  },
]

/* Capture sessions -------------------------------------------------- */

export const LIVE_SESSION_ID = "ses-live"
const now = Date.now()

export const sessions: CaptureSession[] = [
  {
    id: LIVE_SESSION_ID,
    title: "Invoice batch, Friday",
    expert: sabine,
    startedAt: new Date(now - 95_000).toISOString(),
    durationSec: 95,
    status: "live",
    eventCount: 0,
    questionsAsked: 0,
  },
  {
    id: "ses-0418",
    title: "New supplier: Stahlhandel Ritter",
    expert: aylin,
    startedAt: "2026-10-03T10:31:00Z",
    durationSec: 412,
    status: "processing",
    eventCount: 61,
    questionsAsked: 2,
    workMapId: "wm-supplier-onboarding",
  },
  {
    id: "ses-0415",
    title: "Expense reports, November",
    expert: juergen,
    startedAt: "2026-10-03T08:40:00Z",
    durationSec: 545,
    status: "awaiting_debrief",
    eventCount: 88,
    questionsAsked: 3,
    workMapId: "wm-expense-review",
  },
  {
    id: AP_SESSION,
    title: "Month-end invoices",
    expert: sabine,
    startedAt: "2026-10-02T14:05:00Z",
    durationSec: 812,
    status: "mapped",
    eventCount: 143,
    questionsAsked: 4,
    workMapId: "wm-ap-month-end",
  },
]

/** Scripted live feed; the mock reveals these as time passes. */
export const liveScript: Omit<SessionEvent, "id" | "sessionId">[] = [
  { at: 2, kind: "screen", text: "Invoice list opened — 58 open invoices" },
  { at: 9, kind: "speech", text: "Okay, Friday batch. Due dates first, as always." },
  { at: 14, kind: "screen", text: "Sorted by due date (ascending)" },
  { at: 31, kind: "screen", text: "Invoice 4476 opened — Stahlhandel Ritter AG, €12,604.00" },
  { at: 44, kind: "screen", text: "Supplier ID field checked — SUP-30551 verified" },
  { at: 58, kind: "screen", text: "PO-55190 matched, goods receipt GR-88302 found" },
  { at: 77, kind: "screen", text: "Cost center changed from 4711 to 0400" },
  {
    at: 83,
    kind: "question",
    text: "That's another capex booking — does the €5,000 rule apply to the whole invoice or per line?",
  },
  {
    at: 90,
    kind: "speech",
    text: "Per line. A pile of small parts doesn't become capex just because the total is big.",
  },
  { at: 104, kind: "screen", text: "Asset number field filled — AN-30477" },
  { at: 118, kind: "screen", text: "Invoice 4476 posted" },
  { at: 131, kind: "screen", text: "Invoice 4477 opened — Weber Logistik GmbH, €1,980.00" },
  { at: 139, kind: "speech", text: "And there's Weber again." },
  { at: 146, kind: "screen", text: "Invoice 4477 put on hold" },
  {
    at: 150,
    kind: "question",
    text: "You held this one without opening the freight log. Is the amount match enough?",
  },
  {
    at: 160,
    kind: "speech",
    text: "Same route, same amount, same month — that's enough to hold. Checking comes after.",
  },
]
