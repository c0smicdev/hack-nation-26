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
          <DialogTitle>Abandon this recording?</DialogTitle>
          <DialogDescription>
            The workflow is still being recorded. If you leave now, recording stops and the steps
            captured so far won't become a Work Map.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Keep recording
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onLeave()
              blocker.proceed?.()
            }}
          >
            Abandon recording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
