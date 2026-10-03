import { BookOpenText, Landmark, MessageCircleQuestion, Radio } from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router"

import { Badge } from "@/components/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { CaptureIndicator } from "@/features/capture/components/capture-indicator"
import { usingMocks } from "@/lib/api"

import { paths } from "./paths"

const NAV = [
  {
    to: paths.library(),
    label: "Work Maps",
    icon: BookOpenText,
    match: (p: string) => p === "/" || p.startsWith("/work-maps"),
  },
  { to: paths.ask(), label: "Ask Socrates", icon: MessageCircleQuestion },
  { to: paths.capture(), label: "Capture", icon: Radio },
]

function AppSidebar() {
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to={paths.library()}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Landmark className="size-4" />
                </div>
                <div className="grid leading-tight">
                  <span className="font-semibold">Socrates</span>
                  <span className="text-xs text-muted-foreground">Knowledge that stays</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ to, label, icon: Icon, match }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    asChild
                    isActive={match ? match(pathname) : pathname.startsWith(to)}
                    tooltip={label}
                  >
                    <NavLink to={to}>
                      <Icon />
                      <span>{label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <CaptureIndicator />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          {usingMocks && (
            <Badge variant="outline" className="ml-auto text-muted-foreground">
              Mock data
            </Badge>
          )}
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
