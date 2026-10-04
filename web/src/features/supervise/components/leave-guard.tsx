import { useEffect } from "react"
import { useBlocker } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** While `active`, leaving the page (in-app link or closing the tab) asks first. */
export function LeaveGuard({ active, onLeave }: { active: boolean; onLeave: () => void }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!active) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [active])

  return (
    <Dialog open={blocker.state === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this supervised run?</DialogTitle>
          <DialogDescription>
            Socrates is still standing by. If you leave now, screen sharing stops and Socrates can't
            help with the rest of this run.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Keep going
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onLeave()
              blocker.proceed?.()
            }}
          >
            End run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
