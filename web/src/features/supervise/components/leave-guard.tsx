import { useEffect } from "react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation("supervise")
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
          <DialogTitle>{t("leaveGuard.title")}</DialogTitle>
          <DialogDescription>{t("leaveGuard.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            {t("leaveGuard.keepGoing")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onLeave()
              blocker.proceed?.()
            }}
          >
            {t("leaveGuard.endRun")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
