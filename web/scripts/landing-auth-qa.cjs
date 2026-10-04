const assert = require("node:assert/strict")
const path = require("node:path")
const { mkdir } = require("node:fs/promises")
const { chromium } = require(process.argv[2] || "playwright")

const root = path.resolve(__dirname, "..")
const output = path.join(root, "landing-qa.local")
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  email: "demo@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: "Demo Expert" },
  created_at: "2026-01-01T00:00:00.000Z",
}
const jwt = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
const token = `${jwt({ alg: "HS256", typ: "JWT" })}.${jwt({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated" })}.synthetic`

async function run() {
  // This server never loads account credentials or the backend API plugin.
  process.env.VITE_API_URL = "/api"
  process.env.VITE_SUPABASE_URL = "https://socrates-auth-fixture.invalid"
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "synthetic-publishable-key"
  const [{ createServer }, { default: react }, { default: tailwind }] = await Promise.all([
    import("vite"),
    import("@vitejs/plugin-react"),
    import("@tailwindcss/vite"),
  ])
  const server = await createServer({
    root,
    configFile: false,
    envDir: false,
    plugins: [react(), tailwind()],
    resolve: { alias: { "@": path.join(root, "src") } },
    server: { host: "127.0.0.1", port: 0 },
    mode: "routing-qa",
    logLevel: "error",
  })
  await server.listen()
  const origin = server.resolvedUrls.local[0]
  const browser = await chromium.launch({ headless: true, channel: "chrome" })
  try {
    await mkdir(output, { recursive: true })
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport, locale: "en-US" })
      let rejectLogin = true
      await context.route("https://socrates-auth-fixture.invalid/**", async (route) => {
        if (route.request().url().includes("/token") && rejectLogin) {
          return route.fulfill({
            status: 400,
            json: { code: "invalid_credentials", message: "Invalid login credentials" },
          })
        }
        return route.fulfill({
          json: {
            access_token: token,
            refresh_token: "synthetic-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
          },
        })
      })
      await context.route(`${origin}api/**`, async (route) => {
        const pathname = new URL(route.request().url()).pathname
        const json =
          pathname === "/api/me"
            ? {
                id: user.id,
                displayName: "Demo Expert",
                preferences: { language: "en", chattiness: "normal" },
                onboarded: true,
              }
            : []
        await route.fulfill({ json })
      })
      const page = await context.newPage()
      const errors = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(`${origin}landing`)
      await page.locator("#hero-title").waitFor()
      assert.equal(await page.locator("#hero-title").textContent(), "Socrates")
      assert.equal(new URL(page.url()).pathname, "/landing")
      if (viewport.width < 540) await page.getByRole("button", { name: "Open menu" }).click()
      await page
        .getByRole("link", { name: "Log in", exact: true })
        .filter({ visible: true })
        .click()
      await page.locator("#email").waitFor()
      assert.equal(new URL(page.url()).pathname, "/login")
      await page.getByRole("link", { name: "Socrates", exact: true }).click()
      await page.locator("#hero-title").waitFor()
      await page.goto(`${origin}capture`)
      await page.locator("#email").waitFor()
      assert.equal(new URL(page.url()).pathname, "/login")
      await page.locator("#email").fill(user.email)
      await page.locator("#password").fill("synthetic-password")
      await page.getByRole("button", { name: "Sign in", exact: true }).click()
      await page.getByText("Invalid login credentials", { exact: true }).waitFor()
      assert.equal(new URL(page.url()).pathname, "/login")
      rejectLogin = false
      await page.getByRole("button", { name: "Sign in", exact: true }).click()
      await page.waitForURL(`${origin}capture`)
      await page
        .locator("header")
        .getByText("Demo Expert", { exact: true })
        .waitFor({ state: "attached" })
      await page.goto(origin)
      await page
        .getByRole("heading", { name: "Workflows", exact: true })
        .waitFor({ timeout: 5000 })
        .catch(async (error) => {
          console.error({ url: page.url(), body: await page.locator("body").innerText(), errors })
          throw error
        })
      assert.equal(new URL(page.url()).pathname, "/")
      await page.goto(`${origin}landing`)
      await page.locator("#hero-title").waitFor()
      await page.getByRole("link", { name: "Explore Socrates" }).first().click()
      await page.getByRole("heading", { name: "Workflows", exact: true }).waitFor()
      await page.goto(`${origin}landing`)
      await page.locator("#hero-title").waitFor()
      await page.reload()
      await page.locator("#hero-title").waitFor()
      await page.evaluate(() => document.fonts.ready)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(output, `login-routing-${viewport.width}.png`) })
      console.log(
        `PASS ${viewport.width}px: public landing, login link/back link, protected deep link, rejected/successful login, return path, persisted session, CTA, reload, no overflow/errors`,
      )
      await context.close()
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
