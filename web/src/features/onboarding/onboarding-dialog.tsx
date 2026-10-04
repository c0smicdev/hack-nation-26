import { Eye, Loader2, Scale, Sparkles } from "lucide-react"
import { useState } from "react"

import { SocratesFace } from "@/components/socrates-face"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { Chattiness, Profile } from "@/lib/api"
import { useUpdateMe } from "@/lib/auth/hooks"
import { COACHING_STYLES } from "@/lib/coaching"
import { cn } from "@/lib/utils"

const ICONS: Record<Chattiness, typeof Eye> = { quiet: Eye, normal: Scale, curious: Sparkles }

/**
 * Socrates introduces itself and the user picks how it should work with them. The first time
 * someone signs in it can't be dismissed without a choice; reopened from the header (Socrates'
 * face), it shows their current style and closes like any dialog.
 */
export function OnboardingDialog({ me, onClose }: { me: Profile; onClose: () => void }) {
  const update = useUpdateMe()
  const [style, setStyle] = useState<Chattiness>(me.preferences.chattiness ?? "normal")
  const firstRun = !me.onboarded

  // Without login everyone is "You": skip the name rather than greet "Hey You".
  const firstName = me.displayName === "You" ? "" : ` ${me.displayName.split(" ")[0]}`

  return (
    <Dialog open onOpenChange={(open) => !open && !firstRun && onClose()}>
      <DialogContent
        showCloseButton={!firstRun}
        onEscapeKeyDown={(e) => firstRun && e.preventDefault()}
        onInteractOutside={(e) => firstRun && e.preventDefault()}
        className="max-h-[calc(100svh-2rem)] gap-6 overflow-y-auto sm:max-w-2xl"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <SocratesFace className="size-12" />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-2xl tracking-tight">
              Hey{firstName}, I'm Socrates
            </DialogTitle>
            <DialogDescription className="mx-auto max-w-lg text-base leading-relaxed">
              I'll be your AI assistant. When you show me your work, I watch, ask why at the right
              moments and remember it, so your know-how can help the next person. When you're
              learning something new, I'm right next to you, in your expert's own words. How should
              I work with you?
            </DialogDescription>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="How Socrates works with you"
          className="grid gap-3 sm:grid-cols-3"
        >
          {COACHING_STYLES.map(({ value, title, description }) => {
            const Icon = ICONS[value]
            const selected = style === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setStyle(value)}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary bg-accent" : "hover:bg-accent/50",
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon
                    className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")}
                  />
                  <span className="font-medium">{title}</span>
                  {value === "normal" && (
                    <Badge variant="secondary" className="ml-auto">
                      Default
                    </Badge>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">{description}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col items-center gap-2">
          <Button
            size="lg"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { preferences: { chattiness: style }, onboarded: true },
                { onSuccess: onClose },
              )
            }
          >
            {update.isPending && <Loader2 className="animate-spin" />}
            {firstRun ? "Let's get started" : "Save"}
          </Button>
          {update.error && (
            <p className="text-sm text-destructive">Couldn't save that: {update.error.message}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
