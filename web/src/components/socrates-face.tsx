import { cn } from "@/lib/utils"

/**
 * Socrates as line art: bald crown, heavy brows, broad nose, a big bushy beard. Drawn in
 * `currentColor`, so it takes the theme's colors from its parent (e.g. `text-primary-foreground`).
 */
export function SocratesFace({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      {/* Bald crown, with the hair left at the temples */}
      <path d="M17 33C17 18 23.5 9.5 32 9.5S47 18 47 33" />
      <path d="M17 22c-3.5 1-4 6.5-.5 8.5M47 22c3.5 1 4 6.5.5 8.5" />
      {/* Brows, eyes and nose */}
      <path d="M22.5 25.5c2.5-2.2 5.8-2.4 8-.8M33.5 24.7c2.2-1.6 5.5-1.4 8 .8" />
      <circle cx="27" cy="30" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="37" cy="30" r="1.4" fill="currentColor" stroke="none" />
      <path d="M32 29.5c-.8 3-2.2 5.5-3 7 1.6.9 3.6.9 5 0" />
      {/* Bushy beard: where it meets the cheeks, its curly outline, moustache and curls */}
      <path d="M17 33c2 4 4.5 6 7.5 7M47 33c-2 4-4.5 6-7.5 7" />
      <path d="M15 33Q12.8 38.7 16.7 42.5Q16.8 48.7 21.4 50.2Q23.7 55.3 28.2 54.4Q32 57.6 35.8 54.4Q40.3 55.3 42.6 50.2Q47.2 48.7 47.3 42.5Q51.2 38.7 49 33" />
      <path d="M24.5 41.5c2.6-2.8 5.2-3 7.5-1 2.3-2 4.9-1.8 7.5 1" />
      <path d="M22.5 46.5c1.4 1.6 3.2 1.6 4.6 0M29.7 49.5c1.4 1.6 3.2 1.6 4.6 0M36.9 46.5c1.4 1.6 3.2 1.6 4.6 0" />
    </svg>
  )
}
