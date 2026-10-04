import { createBrowserRouter } from "react-router"

import { AskPage } from "@/features/ask/ask-page"
import { LoginPage } from "@/features/auth/login-page"
import { CapturePage } from "@/features/capture/capture-page"
import { SessionPage } from "@/features/capture/session-page"
import { ErpLayout } from "@/features/erp/erp-layout"
import { InvoiceListPage } from "@/features/erp/invoice-list-page"
import { InvoicePage } from "@/features/erp/invoice-page"
import { LessonPage } from "@/features/teach/lesson-page"
import { TeachPage } from "@/features/teach/teach-page"
import { LibraryPage } from "@/features/work-maps/library-page"
import { WorkMapPage } from "@/features/work-maps/work-map-page"

import { AppLayout } from "./app-layout"
import { NotFoundPage, RouteErrorPage } from "./error-pages"
import { RequireAuth } from "./require-auth"

/** To add a page: create it in its feature folder, add a route here and a path in paths.ts. */
export const router = createBrowserRouter([
  { path: "login", element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <LibraryPage /> },
          { path: "work-maps/:workMapId", element: <WorkMapPage /> },
          { path: "ask", element: <AskPage /> },
          { path: "capture", element: <CapturePage /> },
          { path: "capture/:sessionId", element: <SessionPage /> },
          { path: "teach", element: <TeachPage /> },
          { path: "teach/:workMapId", element: <LessonPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
  {
    // The mock ERP is a separate "company system", so it has no Socrates shell.
    path: "erp",
    element: <ErpLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <InvoiceListPage /> },
      { path: "invoices/:invoiceId", element: <InvoicePage /> },
    ],
  },
])
