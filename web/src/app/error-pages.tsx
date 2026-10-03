import { isRouteErrorResponse, Link, useRouteError } from "react-router"

import { Button } from "@/components/ui/button"

import { paths } from "./paths"

function ErrorLayout({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link to={paths.library()}>Back to the library</Link>
      </Button>
    </div>
  )
}

export function NotFoundPage() {
  return <ErrorLayout title="Page not found" message="Socrates doesn't know this page — yet." />
}

export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error"
  return <ErrorLayout title="Something broke" message={message} />
}
