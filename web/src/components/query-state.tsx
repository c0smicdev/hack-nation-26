import { AlertCircle } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

/** Shown when a query fails. Pass `retry` to offer a retry button. */
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useTranslation("common")
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <AlertCircle className="size-6 text-destructive" />
      <div>
        <p className="font-medium">{t("queryState.errorTitle")}</p>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          {t("queryState.retry")}
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}
