import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

import { ProductScene } from "./product-scenes"

gsap.registerPlugin(ScrollTrigger)

type Chapter = {
  id: string
  label: string
  title: string
  text: string
  detail: string
  tone: string
}

export function ScrollStory({ chapters }: { chapters: readonly Chapter[] }) {
  const root = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)

  useEffect(() => {
    const element = root.current
    if (!element) return
    const stage = element.querySelector<HTMLElement>(".scroll-story-stage")
    const frames = Array.from(element.querySelectorAll<HTMLElement>(".story-frame"))
    const progress = element.querySelector<HTMLElement>(".story-progress-fill")
    if (!stage || !progress) return

    const media = gsap.matchMedia()
    media.add(
      {
        motion: "(prefers-reduced-motion: no-preference)",
        reduced: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const reduced = Boolean(context.conditions?.reduced)
        const updateActive = (value: number) => {
          const index = Math.min(frames.length - 1, Math.floor(value * frames.length))
          if (activeRef.current !== index) {
            activeRef.current = index
            setActive(index)
          }
        }
        const triggerOptions = {
          trigger: element,
          start: () =>
            "top top+=" + document.querySelector<HTMLElement>(".landing-header")!.offsetHeight,
          end: () => "+=" + (element.offsetHeight - stage.offsetHeight),
          invalidateOnRefresh: true,
        }

        if (reduced) {
          ScrollTrigger.create({
            ...triggerOptions,
            onUpdate: (self) => {
              updateActive(self.progress)
              gsap.set(progress, { scaleX: self.progress })
            },
            onRefresh: (self) => {
              updateActive(self.progress)
              gsap.set(progress, { scaleX: self.progress })
            },
          })
          return
        }

        gsap.set(frames, { autoAlpha: 0 })
        gsap.set(frames[0], { autoAlpha: 1 })
        const timeline = gsap.timeline({
          paused: true,
          defaults: { ease: "none" },
          onUpdate: () => updateActive(timeline.progress()),
        })

        frames.forEach((frame, index) => {
          if (index > 0) {
            timeline.to(frames[index - 1], { autoAlpha: 0, y: -14, duration: 0.12 }, index - 0.12)
            timeline.fromTo(
              frame,
              { autoAlpha: 0, y: 18 },
              { autoAlpha: 1, y: 0, duration: 0.12 },
              index - 0.12,
            )
          }
          for (let beat = 1; beat <= 3; beat++) {
            const targets = frame.querySelectorAll(".scene-motion-" + beat)
            if (targets.length)
              timeline.fromTo(
                targets,
                { opacity: 0, y: 12 },
                { opacity: 1, y: 0, duration: 0.12 },
                index + 0.1 + (beat - 1) * 0.17,
              )
          }
        })
        timeline.fromTo(
          frames[0].querySelector(".scene-cursor"),
          { x: -100, y: -35 },
          { x: 0, y: 0, duration: 0.35 },
          0,
        )
        timeline.to(
          frames[0].querySelector(".invoice-focus"),
          { backgroundColor: "#d8f4ed", duration: 0.15 },
          0.2,
        )
        timeline.fromTo(progress, { scaleX: 0 }, { scaleX: 1, duration: frames.length }, 0)
        ScrollTrigger.create({ ...triggerOptions, animation: timeline, scrub: 0.45 })
      },
    )

    return () => media.revert()
  }, [chapters])

  return (
    <section
      ref={root}
      className="scroll-story"
      aria-label="From observing work to guiding a teammate"
    >
      <div className={"scroll-story-stage tone-" + chapters[active].tone}>
        <div className="story-progress">
          <ol className="landing-container" aria-label="Current stage">
            {chapters.map((chapter, index) => (
              <li key={chapter.id} aria-current={active === index ? "step" : undefined}>
                <span>0{index + 1}</span>
                {chapter.label}
              </li>
            ))}
          </ol>
          <div className="story-progress-track">
            <span className="story-progress-fill" />
          </div>
        </div>
        <div className="story-frames">
          {chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              className={"story-frame" + (index === 0 ? " first-frame" : "")}
              aria-hidden={active !== index}
              inert={active !== index}
            >
              <div className="landing-container chapter-layout">
                <div className="chapter-copy">
                  <p className="eyebrow">
                    <span className="chapter-number">0{index + 1}</span>
                    {chapter.label}
                  </p>
                  <h2>{chapter.title}</h2>
                  <p>{chapter.text}</p>
                  <div className="chapter-detail">
                    <Check />
                    {chapter.detail}
                  </div>
                </div>
                <ProductScene stage={index} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
