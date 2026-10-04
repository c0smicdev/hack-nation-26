import { useEffect, useRef } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function useLandingMotion() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const media = gsap.matchMedia()
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        gsap.from(".hero-copy > *", {
          y: 22,
          opacity: 0,
          stagger: 0.09,
          duration: 0.8,
          ease: "power3.out",
        })
        gsap.from(".hero-art", { y: 28, opacity: 0, duration: 1.2, ease: "power2.out" })
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
          gsap.from(element, {
            y: 24,
            opacity: 0,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: { trigger: element, start: "top 92%", once: true },
          })
        })
      }, root)
      return () => context.revert()
    })
    return () => media.revert()
  }, [])

  return { root }
}
