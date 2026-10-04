const { chromium } = require(process.argv[2] || "playwright")
const { mkdir, writeFile } = require("node:fs/promises")
const path = require("node:path")
const assert = require("node:assert/strict")

const output = path.resolve(__dirname, "../landing-qa.local")
const url = process.env.LANDING_URL || "http://127.0.0.1:5173/landing"
const cases = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "desktop-short", width: 1280, height: 720 },
  { name: "desktop-wide", width: 1920, height: 1080 },
  { name: "laptop-compact", width: 900, height: 600 },
  { name: "tablet-narrow", width: 600, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 820, height: 620 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-short", width: 375, height: 667 },
  { name: "reduced-motion", width: 390, height: 844, reduced: true },
]

async function scrollToPhase(page, progress) {
  await page.evaluate((value) => {
    const root = document.querySelector(".scroll-story")
    const stage = root.querySelector(".scroll-story-stage")
    const header = document.querySelector(".landing-header").offsetHeight
    const start = root.getBoundingClientRect().top + window.scrollY - header
    window.scrollTo(0, start + (root.offsetHeight - stage.offsetHeight) * value)
  }, progress)
  await page.waitForTimeout(1000)
}

async function inspect(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect()
      return {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        height: box.height,
      }
    }
    const active = document.querySelector('.story-frame[aria-hidden="false"]')
    const scene = active.querySelector(".product-scene")
    const body = scene.querySelector(".scene-body")
    const content = Array.from(body.children).filter((element) => {
      const style = getComputedStyle(element)
      return style.display !== "none" && style.position !== "absolute"
    })
    return {
      active: Array.from(active.parentElement.children).indexOf(active),
      activeCount: document.querySelectorAll('.story-frame[aria-hidden="false"]').length,
      inactiveInert: Array.from(
        document.querySelectorAll('.story-frame[aria-hidden="true"]'),
      ).every((element) => element.inert),
      stage: rect(document.querySelector(".scroll-story-stage")),
      copy: rect(active.querySelector(".chapter-copy")),
      scene: rect(scene),
      contentBottom: Math.max(...content.map((element) => rect(element).bottom)),
      sceneOverflow: body.scrollHeight - body.clientHeight,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      headerBottom: document.querySelector(".landing-header").getBoundingClientRect().bottom,
    }
  })
}

async function run() {
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const results = []
  try {
    for (const test of cases.filter(
      (test) => !process.argv[3] || test.name.includes(process.argv[3]),
    )) {
      const context = await browser.newContext({
        viewport: { width: test.width, height: test.height },
        reducedMotion: test.reduced ? "reduce" : "no-preference",
      })
      const page = await context.newPage()
      const errors = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text())
      })
      await page.goto(url, { waitUntil: "networkidle" })
      await page.waitForTimeout(1400)
      const brand = await page.evaluate(() => ({
        header: getComputedStyle(document.querySelector(".landing-brand")).fontFamily,
        hero: getComputedStyle(document.querySelector(".hero-copy h1")).fontFamily,
        assetLoaded: document.querySelector(".hero-art").naturalWidth > 0,
        pauseButtons: Array.from(document.querySelectorAll("button")).filter((button) =>
          /pause motion/i.test(button.textContent),
        ).length,
      }))
      assert.equal(brand.header, brand.hero)
      assert.equal(brand.assetLoaded, true)
      assert.equal(brand.pauseButtons, 0)
      await page.screenshot({ path: path.join(output, test.name + "-hero.png") })
      const phases = []
      for (const [index, progress] of [0.18, 0.43, 0.68, 0.93].entries()) {
        await scrollToPhase(page, progress)
        const state = await inspect(page)
        assert.equal(state.active, index, test.name + ": automatic phase")
        assert.equal(state.activeCount, 1)
        assert.equal(state.inactiveInert, true)
        assert.equal(state.documentOverflow, 0)
        assert.ok(
          state.sceneOverflow <= 1,
          test.name + ": scene content fits " + JSON.stringify(state),
        )
        assert.ok(
          state.contentBottom <= state.scene.bottom - 8,
          test.name + ": actions are not clipped",
        )
        assert.ok(state.scene.bottom <= test.height, test.name + ": scene fits viewport")
        assert.ok(state.copy.top >= state.headerBottom, test.name + ": heading below header")
        await page.screenshot({ path: path.join(output, test.name + "-phase-" + index + ".png") })
        phases.push(state)
      }
      await page.getByRole("button", { name: "Send to Finance", exact: true }).click()
      await page.getByText("Right call. This one goes to Finance first.", { exact: true }).waitFor()
      await page.getByRole("button", { name: "Try again", exact: true }).click()
      await scrollToPhase(page, 0.18)
      assert.equal((await inspect(page)).active, 0, test.name + ": reverse scroll")
      const travel = await page
        .locator(".scroll-story")
        .evaluate(
          (root) => root.offsetHeight - root.querySelector(".scroll-story-stage").offsetHeight,
        )
      await page.mouse.wheel(0, travel * 0.3)
      await page.waitForTimeout(1000)
      assert.equal((await inspect(page)).active, 1, test.name + ": wheel advances story")
      await page.mouse.wheel(0, -travel * 0.3)
      await page.waitForTimeout(1000)
      assert.equal((await inspect(page)).active, 0, test.name + ": wheel reverses story")
      await scrollToPhase(page, 1)
      await page.mouse.wheel(0, test.height)
      await page.waitForTimeout(600)
      const unpin = await page.locator(".scroll-story-stage").boundingBox()
      assert.ok(unpin.y < 0, test.name + ": stage releases")
      await page.locator("#example-amount").focus()
      await page.keyboard.press("Home")
      for (let step = 0; step < 40; step++) await page.keyboard.press("ArrowRight")
      await page
        .getByText("Within the limit. Follow the standard route.", { exact: true })
        .waitFor()
      await page.locator("#example-amount").focus()
      await page.keyboard.press("ArrowRight")
      await page.getByText("Different amount. Different next step.", { exact: true }).waitFor()
      await page.getByRole("tab", { name: "Customer operations" }).click()
      await page
        .getByRole("tabpanel")
        .getByText("Keep the context behind the escalation.", { exact: true })
        .waitFor()
      await page.getByRole("tab", { name: "Customer operations" }).press("ArrowRight")
      await page
        .getByRole("tabpanel")
        .getByText("Make the handover more than a checklist.", { exact: true })
        .waitFor()
      assert.deepEqual(errors, [], test.name + ": browser errors")
      const result = { test: test.name, brand, phases, errors }
      results.push(result)
      console.log(JSON.stringify(result))
      await context.close()
    }
  } finally {
    await browser.close()
    await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2))
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
