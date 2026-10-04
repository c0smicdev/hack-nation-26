import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import {
  ArrowDown,
  ArrowRight,
  Asterisk,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  FileText,
  GitBranch,
  Headphones,
  ListChecks,
  Mic,
  MousePointer2,
  Play,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react"

function Waveform() {
  return (
    <span className="voice-wave" aria-hidden="true">
      {Array.from({ length: 15 }, (_, index) => (
        <i
          key={index}
          style={{ height: `${8 + ((index * 7) % 19)}px`, animationDelay: `${index * 0.08}s` }}
        />
      ))}
    </span>
  )
}

function Person({
  name = "Sabine",
  role = "Finance team",
  initials = "SB",
}: {
  name?: string
  role?: string
  initials?: string
}) {
  return (
    <div className="scene-person">
      <span className="person-avatar">{initials}</span>
      <span>
        <strong>{name}</strong>
        <small>{role}</small>
      </span>
    </div>
  )
}

function Invoice({ teaching = false }: { teaching?: boolean }) {
  return (
    <div className="invoice-document">
      <div className="invoice-heading">
        <span>
          <FileText />
          <strong>Supplier invoice</strong>
        </span>
        <span className="invoice-id">#{teaching ? "4480" : "4471"}</span>
      </div>
      <div className="invoice-supplier">
        <span>Northstar Equipment</span>
        <small>{teaching ? "Office equipment" : "Workshop equipment"}</small>
      </div>
      <div className="invoice-fields">
        <div>
          <span>Amount</span>
          <strong>EUR {teaching ? "6,400" : "7,200"}.00</strong>
        </div>
        <div>
          <span>Category</span>
          <strong>Equipment</strong>
        </div>
        <div className="invoice-focus">
          <span>Approval route</span>
          <strong>
            Finance review <ChevronRight />
          </strong>
        </div>
      </div>
      <div className="invoice-bottom">
        <span>
          <ShieldCheck />
          Company approval policy
        </span>
        <span className="illustration-action">
          {teaching ? "Review" : "Send for review"}
          <ArrowRight />
        </span>
      </div>
    </div>
  )
}

function SceneHeader({ stage }: { stage: number }) {
  return (
    <div className="scene-window-header">
      <div className="window-dots">
        <i />
        <i />
        <i />
      </div>
      <span>
        {stage < 2
          ? "Supplier approvals"
          : stage === 2
            ? "Supplier approvals / Work Map"
            : "Supplier approvals / Guided practice"}
      </span>
      <small>Illustrative workflow</small>
    </div>
  )
}

function ObserveScene() {
  return (
    <>
      <div className="scene-topline">
        <Person />
        <span className="scene-status">
          <i />
          Socrates is observing
        </span>
      </div>
      <Invoice />
      <div className="observation-log">
        <span>
          <Check />
          Invoice opened
        </span>
        <span className="scene-motion scene-motion-1">
          <Check />
          Amount noticed
        </span>
        <span className="scene-motion scene-motion-2">
          <Check />
          Approval route changed
        </span>
      </div>
      <div className="scene-cursor">
        <MousePointer2 fill="currentColor" />
        <span>Sabine</span>
      </div>
      <div className="scene-caption">
        <Asterisk />
        <span>
          A click shows <strong>what</strong> happened.
          <br />
          The reason is still with Sabine.
        </span>
      </div>
    </>
  )
}

function UnderstandScene() {
  return (
    <>
      <div className="scene-topline">
        <Person />
        <span className="scene-status">
          <Mic />A natural pause
        </span>
      </div>
      <div className="conversation-context">
        <FileText />
        <span>
          Invoice #4471<strong>EUR 7,200.00</strong>
        </span>
        <span className="context-amount">Finance review</span>
      </div>
      <div className="conversation-turn scene-motion scene-motion-1">
        <span className="agent-avatar">
          <Asterisk />
        </span>
        <div>
          <small>Socrates</small>
          <p>What makes this invoice need another approval?</p>
        </div>
      </div>
      <div className="conversation-turn expert-turn scene-motion scene-motion-2">
        <span className="person-avatar">SB</span>
        <div>
          <small>Sabine</small>
          <p>For equipment above EUR 5,000, Finance reviews it before we approve.</p>
          <Waveform />
        </div>
      </div>
      <div className="reason-captured scene-motion scene-motion-3">
        <CheckCheck />
        <span>The reason, not just the action.</span>
      </div>
    </>
  )
}

function RememberScene() {
  return (
    <>
      <div className="work-map-heading">
        <span className="map-icon">
          <GitBranch />
        </span>
        <div>
          <small>Work Map</small>
          <h3>Supplier approvals</h3>
        </div>
        <span className="confirmed-tag">
          <CircleCheck />
          Expert reviewed
        </span>
      </div>
      <div className="map-flow">
        <div className="map-node">
          <FileText />
          <span>Review the invoice</span>
          <Check />
        </div>
        <div className="map-connector scene-motion scene-motion-1">
          <ArrowDown />
        </div>
        <div className="map-rule scene-motion scene-motion-1">
          <span className="rule-label">Decision</span>
          <strong>Equipment above EUR 5,000?</strong>
          <div className="rule-branches">
            <span>
              No
              <ArrowRight />
              Standard approval
            </span>
            <span>
              Yes
              <ArrowRight />
              <b>Finance review</b>
            </span>
          </div>
        </div>
        <div className="map-connector scene-motion scene-motion-2">
          <ArrowDown />
        </div>
        <div className="map-source scene-motion scene-motion-2">
          <Person role="Source: session 01:42" />
          <p>"Finance reviews it before we approve."</p>
          <span>
            <Play />
            Screen moment attached
          </span>
        </div>
      </div>
    </>
  )
}

function GuideScene() {
  const [approved, setApproved] = useState(false)
  return (
    <>
      <div className="scene-topline">
        <Person name="Alex" role="New to the team" initials="AL" />
        <span className="scene-status">
          <Headphones />
          Guided practice
        </span>
      </div>
      <Invoice teaching />
      <div
        className={`guidance-message scene-motion scene-motion-1${approved ? "guidance-success" : ""}`}
        role="status"
      >
        <span className="agent-avatar">{approved ? <Check /> : <Asterisk />}</span>
        <div>
          <small>{approved ? "Decision checked" : "A useful pause before approval"}</small>
          <p>
            {approved
              ? "Right call. This one goes to Finance first."
              : "This is above the team's review threshold. Sabine would send it to Finance first."}
          </p>
        </div>
      </div>
      <div className="guide-actions">
        <span>
          <ShieldCheck />
          Grounded in Sabine's Work Map
        </span>
        <button className="scene-button" onClick={() => setApproved(!approved)}>
          {approved ? <RotateCcw /> : <ArrowRight />}
          {approved ? "Try again" : "Send to Finance"}
        </button>
      </div>
    </>
  )
}

export function ProductScene({ stage }: { stage: number }) {
  return (
    <div
      className={`product-scene scene-stage-${stage}`}
      aria-label={
        [
          "Expert reviewing a supplier invoice",
          "Socrates asking for the reasoning behind a decision",
          "Expert-reviewed Work Map with its source",
          "New teammate applying the expert's reasoning",
        ][stage]
      }
    >
      <SceneHeader stage={stage} />
      <div className="scene-body">
        {stage === 0 ? (
          <ObserveScene />
        ) : stage === 1 ? (
          <UnderstandScene />
        ) : stage === 2 ? (
          <RememberScene />
        ) : (
          <GuideScene />
        )}
      </div>
    </div>
  )
}

export function DecisionExplorer() {
  const [amount, setAmount] = useState(7200)
  const needsReview = amount > 5000
  return (
    <div className="decision-explorer">
      <div className="decision-controls">
        <p className="eyebrow">Example: equipment approval</p>
        <label htmlFor="example-amount">
          Invoice amount<span>EUR {amount.toLocaleString("en-GB")}</span>
        </label>
        <input
          id="example-amount"
          type="range"
          min="1000"
          max="9000"
          step="100"
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
        />
        <div className="range-labels">
          <span>EUR 1,000</span>
          <span>EUR 9,000</span>
        </div>
        <p className="policy-note">
          Example team policy: equipment above EUR 5,000 needs a Finance review.
        </p>
      </div>
      <div className="decision-path">
        <div className="decision-start">
          <FileText />
          <span>Equipment invoice</span>
          <strong>EUR {amount.toLocaleString("en-GB")}</strong>
        </div>
        <div className="decision-line">
          <ArrowDown />
        </div>
        <div className="decision-question">
          <GitBranch />
          Above EUR 5,000?
        </div>
        <div className="decision-fork">
          <div className={!needsReview ? "active-route" : ""}>
            <span>No</span>
            <div>
              <Check />
              <strong>Standard approval</strong>
              <small>Continue with the usual checks.</small>
            </div>
          </div>
          <div className={needsReview ? "active-route review-route" : ""}>
            <span>Yes</span>
            <div>
              <Users />
              <strong>Finance review</strong>
              <small>Get a second pair of eyes.</small>
            </div>
          </div>
        </div>
        <p className="decision-result" role="status">
          <CircleCheck />
          {needsReview
            ? "Different amount. Different next step."
            : "Within the limit. Follow the standard route."}
        </p>
      </div>
    </div>
  )
}

const teamExamples = [
  {
    name: "Finance",
    icon: FileText,
    heading: "Pass on the judgment behind the approval.",
    text: "Help the next teammate recognize exceptions, review thresholds and the moments that need a second pair of eyes.",
    request: "Equipment purchase",
    condition: "Above the review threshold",
    action: "Ask Finance to review",
    reason: "The amount changes who needs to approve.",
    person: "Finance specialist",
  },
  {
    name: "Customer operations",
    icon: Headphones,
    heading: "Keep the context behind the escalation.",
    text: "Turn an experienced colleague's handling of a difficult case into guidance for the person facing the next one.",
    request: "Repeat customer issue",
    condition: "The standard fix already failed",
    action: "Escalate with the case history",
    reason: "Repeating the same fix loses the customer's trust.",
    person: "Support lead",
  },
  {
    name: "People operations",
    icon: Users,
    heading: "Make the handover more than a checklist.",
    text: "Capture the checks and dependencies experienced colleagues look for, so a new teammate knows when something is missing.",
    request: "New starter setup",
    condition: "Manager approval is missing",
    action: "Confirm before granting access",
    reason: "The right access depends on the person's role.",
    person: "People operations lead",
  },
] as const

export function TeamStories() {
  const [selected, setSelected] = useState(0)
  const example = teamExamples[selected]
  const Icon = example.icon
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const context = gsap.context(() => {
      gsap.from(".team-path > *", { opacity: 0, y: 12, stagger: 0.1, duration: 0.45 })
    }, panel)
    return () => context.revert()
  }, [selected])

  return (
    <>
      <div className="team-tabs" role="tablist" aria-label="Team examples">
        {teamExamples.map(({ name, icon: TabIcon }, index) => (
          <button
            key={name}
            id={"team-tab-" + index}
            role="tab"
            aria-selected={selected === index}
            aria-controls="team-example"
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
                event.preventDefault()
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (selected + (event.key === "ArrowRight" ? 1 : 2)) % 3
                setSelected(next)
                document.getElementById("team-tab-" + next)?.focus()
              }
            }}
          >
            <TabIcon />
            {name}
          </button>
        ))}
      </div>
      <div
        ref={panel}
        id="team-example"
        className="team-example"
        role="tabpanel"
        aria-labelledby={"team-tab-" + selected}
        tabIndex={0}
      >
        <div>
          <h3>{example.heading}</h3>
          <p>{example.text}</p>
          <span className="team-example-label">Illustrative use case</span>
        </div>
        <div className="team-path" key={selected}>
          <div className="team-request">
            <Icon />
            <span>{example.request}</span>
          </div>
          <div className="team-condition">
            <GitBranch />
            <span>{example.condition}</span>
          </div>
          <div className="team-action">
            <Check />
            <span>{example.action}</span>
          </div>
          <div className="team-reason">
            <ListChecks />
            <div>
              <small>The reasoning</small>
              <p>{example.reason}</p>
              <span>{example.person}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
