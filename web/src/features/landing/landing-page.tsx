import { useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  ChevronDown,
  ExternalLink,
  Menu,
  MessageCircle,
  Mic,
  ShieldCheck,
  X,
} from "lucide-react"
import { Link } from "react-router"

import { paths } from "@/app/paths"
import { DecisionExplorer, TeamStories } from "./product-scenes"
import { ScrollStory } from "./scroll-story"
import { useLandingMotion } from "./use-landing-motion"
import "./landing.css"

const chapters = [
  {
    id: "observe",
    label: "Observe",
    title: "Start with the work. Not another document.",
    text: "Your experienced people do a real task. Socrates follows along, connecting what happens on screen with the decisions behind it.",
    detail: "The everyday work is the starting point.",
    tone: "white",
  },
  {
    id: "understand",
    label: "Understand",
    title: "The right question unlocks the real knowledge.",
    text: "Why this approval? When would you stop? A short conversation reveals the exceptions and unwritten rules that a recording alone would miss.",
    detail: "A conversation, at a natural pause.",
    tone: "coral",
  },
  {
    id: "remember",
    label: "Remember",
    title: "Give the reasoning a place to live.",
    text: "Steps, decisions and exceptions become a Work Map. Your expert reviews it, with their words and the original screen moment attached.",
    detail: "Experience becomes something your team can use.",
    tone: "mint",
  },
  {
    id: "guide",
    label: "Guide",
    title: "Help the next person make the next call.",
    text: "A teammate works through a new case with guidance grounded in your expert's reasoning. They learn what to do, why it matters, and when to ask for help.",
    detail: "Understanding, not just following instructions.",
    tone: "lime",
  },
] as const

const questions = [
  {
    question: "How is Socrates different from a screen recording?",
    answer:
      "A recording preserves what happened. Socrates also asks about the reasoning: why a decision was made, what changes it, and when someone should stop and ask. Those explanations stay connected to the relevant step in a Work Map.",
  },
  {
    question: "Does the expert need to write a process document?",
    answer:
      "No. The starting point is doing the work and answering spoken questions. A debrief fills the gaps, and the expert reviews the resulting Work Map before it is used to guide someone else.",
  },
  {
    question: "What kinds of work is this for?",
    answer:
      "Screen-based work with decisions that depend on experience, such as supplier approvals, customer escalations and onboarding. The examples on this page are illustrative, not customer results or promises of integrations.",
  },
  {
    question: "Can I keep part of a session off the record?",
    answer:
      "Yes. Off-the-record mode pauses capture and questions. Use the current product with sample data; production storage and server-side personal-data redaction are still being developed.",
  },
]

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link to={paths.landing()} className={"landing-brand" + (footer ? " footer-brand" : "")}>
      <Asterisk aria-hidden="true" />
      <span>Socrates</span>
    </Link>
  )
}

export function LandingPage() {
  const { root } = useLandingMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div ref={root} className="socrates-landing">
      <a className="landing-skip" href="#main-content">
        Skip to content
      </a>
      <header className="landing-header">
        <div className="landing-container landing-nav">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#for-your-team">For your team</a>
            <a href="#questions">Questions</a>
          </nav>
          <div className="nav-actions">
            <Link className="landing-login" to={paths.login()}>
              Log in
            </Link>
            <Link className="landing-button button-small" to={paths.library()}>
              Explore Socrates <ArrowUpRight />
            </Link>
            <button
              className="icon-button menu-toggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-nav"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="landing-mobile-nav" className="mobile-nav" aria-label="Mobile navigation">
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              How it works
            </a>
            <a href="#for-your-team" onClick={() => setMenuOpen(false)}>
              For your team
            </a>
            <a href="#questions" onClick={() => setMenuOpen(false)}>
              Questions
            </a>
            <Link to={paths.login()} onClick={() => setMenuOpen(false)}>
              Log in
            </Link>
          </nav>
        )}
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="hero-title">
          <img
            className="hero-art"
            src="/images/landing/knowledge-path.png"
            alt="Work documents connected to a conversation, a decision tree and an open guide"
            width="1774"
            height="887"
            fetchPriority="high"
          />
          <div className="hero-copy">
            <p className="eyebrow">Expertise, put to work</p>
            <h1 id="hero-title">Socrates</h1>
            <p className="hero-promise">
              Your team's know-how.
              <br />
              Ready for what's next.
            </p>
            <p className="hero-description">
              Turn the way your best people work into guidance
              <br className="desktop-break" /> your whole team can learn from.
            </p>
            <div className="hero-actions">
              <Link className="landing-button" to={paths.library()}>
                Explore Socrates <ArrowRight />
              </Link>
              <a className="landing-text-link" href="#how-it-works">
                See how it works <ArrowDown />
              </a>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="story-intro landing-container">
          <div>
            <p className="eyebrow">Beyond the how-to</p>
            <h2>
              The steps are only
              <br />
              half the story.
            </h2>
          </div>
          <div className="intro-description" data-reveal>
            <p>
              Your experienced people know which detail changes the decision. Socrates helps that
              knowledge travel further.
            </p>
            <p className="muted-copy">From the first conversation to the next person's work.</p>
          </div>
        </section>
        <ScrollStory chapters={chapters} />

        <section className="decision-section landing-container" aria-labelledby="decision-title">
          <div className="section-heading" data-reveal>
            <p className="eyebrow">It's the detail that makes the difference</p>
            <h2 id="decision-title">
              Same task.
              <br />
              Different judgment.
            </h2>
            <p>
              A good guide tells you the next step. A useful one tells you when that step needs to
              change.
            </p>
          </div>
          <DecisionExplorer />
        </section>
        <section id="for-your-team" className="team-section">
          <div className="landing-container">
            <div className="team-heading" data-reveal>
              <p className="eyebrow">For the work that runs your business</p>
              <h2>
                Less starting from scratch.
                <br />
                More knowing what to do.
              </h2>
            </div>
            <TeamStories />
          </div>
        </section>
        <section className="human-section landing-container">
          <div className="human-symbol" aria-hidden="true">
            <MessageCircle />
            <span>
              <Mic />
            </span>
          </div>
          <div data-reveal>
            <p className="eyebrow">Keep people in the picture</p>
            <h2>
              The expertise is human.
              <br />
              The reach is new.
            </h2>
            <p>
              Not a replacement for your experienced people. A way to make their reasoning available
              when someone else needs it.
            </p>
          </div>
          <div className="human-principles" data-reveal>
            <div>
              <ShieldCheck />
              <p>
                <strong>Expert-reviewed</strong>
                <span>
                  A Work Map starts with a person's knowledge, then comes back to them for review.
                </span>
              </p>
            </div>
            <div>
              <Mic />
              <p>
                <strong>In their own words</strong>
                <span>Explanations stay connected to the conversation and the screen moment.</span>
              </p>
            </div>
          </div>
        </section>
        <section id="questions" className="faq-section landing-container">
          <div data-reveal>
            <p className="eyebrow">A few things worth knowing</p>
            <h2>
              Good questions.
              <br />
              Straight answers.
            </h2>
          </div>
          <div className="faq-list">
            {questions.map(({ question, answer }) => (
              <details key={question}>
                <summary>
                  {question}
                  <ChevronDown aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing-section">
          <div className="landing-container closing-layout" data-reveal>
            <div>
              <p className="eyebrow">Make experience go further</p>
              <h2>
                Your team already
                <br />
                has the knowledge.
              </h2>
              <p>Give the next person a better place to start.</p>
            </div>
            <Link className="landing-button button-light" to={paths.library()}>
              Explore Socrates <ArrowRight />
            </Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer landing-container">
        <Brand footer />
        <p>Learn the work. Understand the why.</p>
        <Link to={paths.library()}>
          Open app <ExternalLink />
        </Link>
      </footer>
    </div>
  )
}
