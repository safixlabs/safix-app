import { expect, test } from "@playwright/test"

/**
 * Layout regressions on the screens people actually land on.
 *
 * These run without a wallet, so what is captured is the shape of each screen
 * rather than any one account's numbers. Animation is disabled and the whole
 * page is captured, so a panel that grows, collapses or reflows shows up as a
 * diff. Baselines are per platform; CI's are Linux, and are the ones committed.
 */
const screens = [
  { path: "/", name: "dashboard" },
  { path: "/borrow/", name: "borrow" },
  { path: "/pool/", name: "pool" },
  { path: "/partnerships/", name: "partnerships" },
  { path: "/assets/", name: "assets" },
  { path: "/passport/", name: "passport" },
  { path: "/risk/", name: "risk" },
  { path: "/terms/", name: "terms" }
]

test.describe("layout", () => {
  // A baseline only means anything on the platform that drew it: text rendering
  // differs enough between macOS and Linux to make every pixel comparison fail.
  // CI is Linux, and the committed baselines are Linux, so that is where these
  // run. Generate them with `npm run e2e:update-snapshots` on Linux.
  test.skip(process.platform !== "linux", "layout baselines are captured on Linux, as CI is")

  for (const screen of screens) {
    test(`${screen.name} keeps its layout`, async ({ page }) => {
      await page.goto(screen.path)
      await page.waitForLoadState("networkidle")
      // The backdrop animates; hold it still so the capture is deterministic.
      await page.addStyleTag({
        content: `*, *::before, *::after { animation: none !important; transition: none !important; }`
      })
      await page.waitForTimeout(500)
      await expect(page).toHaveScreenshot(`${screen.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
        animations: "disabled"
      })
    })
  }
})
