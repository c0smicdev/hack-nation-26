import { Landmark, Languages, LogIn, LogOut, MessageCircleQuestion } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, Outlet } from "react-router"

import { SocratesFace } from "@/components/socrates-face"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { AskPanel } from "@/features/ask/ask-panel"
import { OnboardingDialog } from "@/features/onboarding/onboarding-dialog"
import { useAuth } from "@/lib/auth/context"
import type { Language } from "@/lib/api"
import { useMe, useUpdateMe } from "@/lib/auth/hooks"
import { authEnabled } from "@/lib/auth/supabase"
import { initials } from "@/lib/format"
import { currentLanguage, setLanguage } from "@/lib/i18n"
import { LANGUAGES } from "@/lib/i18n/languages"

import { paths } from "./paths"

export function AppLayout() {
  const { session, signOut } = useAuth()
  const { data: me } = useMe()
  const updateMe = useUpdateMe()
  const { t, i18n } = useTranslation()
  const language = currentLanguage()
  // The profile's language wins over the one remembered in this browser.
  const saved = me?.preferences.language
  useEffect(() => {
    if (saved && saved !== i18n.language) void setLanguage(saved)
  }, [saved, i18n])

  // Workflows come back in the reader's language: fetch them again after a switch.
  const queryClient = useQueryClient()
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["work-maps"] })
  }, [language, queryClient])

  function pickLanguage(code: Language) {
    void setLanguage(code)
    updateMe.mutate({ preferences: { language: code } })
  }

  // Onboarding shows on first sign-in, and again whenever Socrates' face is clicked.
  const [reopened, setReopened] = useState(false)
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-8">
        <Link to={paths.library()} className="flex items-center gap-2">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Landmark className="size-4" />
          </div>
          <span className="font-heading text-lg font-semibold tracking-tight text-primary">
            Socrates
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          {me && (
            <button
              type="button"
              onClick={() => setReopened(true)}
              aria-label={t("header.socratesStyle")}
              title={t("header.socratesStyle")}
              className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <SocratesFace className="size-8" />
            </button>
          )}
          {me && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent">
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">{initials(me.displayName)}</AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:inline">{me.displayName}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block font-medium">{me.displayName}</span>
                  {me.email && (
                    <span className="block truncate text-xs text-muted-foreground">{me.email}</span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Languages className="size-4 text-muted-foreground" />
                  {t("profileMenu.language")}
                </DropdownMenuLabel>
                <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                  {t("profileMenu.languageHint")}
                </p>
                {/* A flat list, not a hover submenu: it stays put while the pointer moves. */}
                <DropdownMenuRadioGroup
                  value={language}
                  onValueChange={(code) => pickLanguage(code as Language)}
                  className="max-h-72 overflow-y-auto"
                >
                  {LANGUAGES.map((l) => (
                    <DropdownMenuRadioItem key={l.code} value={l.code} lang={l.code}>
                      {l.native}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {session ? (
            <>
              <Button variant="outline" onClick={() => void signOut()}>
                <LogOut />
                {t("header.logOut")}
              </Button>
            </>
          ) : (
            authEnabled && (
              <Button asChild>
                <Link to={paths.login()}>
                  <LogIn />
                  {t("header.logIn")}
                </Link>
              </Button>
            )
          )}
        </div>
      </header>
      <main className="flex-1 p-4 pb-20 md:p-8 md:pb-20">
        <Outlet />
      </main>
      {me && (!me.onboarded || reopened) && (
        <OnboardingDialog me={me} onClose={() => setReopened(false)} />
      )}
      <Sheet>
        <SheetTrigger asChild>
          <Button size="lg" className="fixed right-4 bottom-4 z-40 rounded-full shadow-lg">
            <MessageCircleQuestion />
            {t("header.askSocrates")}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="pb-0">
            <SheetTitle>{t("header.askSocrates")}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 px-4 pb-4">
            <AskPanel
              suggestions={[
                t("askSuggestions.capex"),
                t("askSuggestions.unknownSupplier"),
                t("askSuggestions.intercompany"),
              ]}
              className="h-full"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
