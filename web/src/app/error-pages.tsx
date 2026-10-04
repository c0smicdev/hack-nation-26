import { useTranslation } from "react-i18next"
import { isRouteErrorResponse, Link, useRouteError } from "react-router"

import { Button } from "@/components/ui/button"

import { paths } from "./paths"

function ErrorLayout({ title, message }: { title: string; message: string }) {
  const { t } = useTranslation("common")
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link to={paths.library()}>{t("errorPages.backToLibrary")}</Link>
      </Button>
    </div>
  )
}

export function NotFoundPage() {
  const { t } = useTranslation("common")
  return (
    <ErrorLayout title={t("errorPages.notFoundTitle")} message={t("errorPages.notFoundMessage")} />
  )
}

export function RouteErrorPage() {
  const { t } = useTranslation("common")
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : t("errorPages.unknownError")
  return <ErrorLayout title={t("errorPages.brokeTitle")} message={message} />
}
