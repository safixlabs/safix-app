import { expect, test } from "@playwright/test"

/**
 * Layout regressions on the screens people actually land on.
 *
 * These run without a wallet, so what is captured is the shape of each screen
 * rather than any one account's numbers. Animation is disabled and the whole
 * page is captured, so a panel that grows, collapses or reflows shows up as a
 * diff. Baselines are per platform; CI's are Linux, and are the ones committed.
 *
 * Every figure on these screens is read from the chain, so the figures move
 * between runs. They are masked rather than compared: what is asserted is that
 * a number of that size sits in that place, which is the layout question. The
 * mask keeps the element's own box, so a figure that grows enough to reflow the
 * panel around it still shows up.
 *
 * Partnerships is not here, and cannot be. It is a list whose length is whatever
 * the chain holds, and the suites that run before this one add to it, so the page
 * is a different height from one run to the next. A mask cannot hide a card that
 * makes the page taller, and a baseline redrawn to match becomes wrong as soon as
 * anything creates another partnership. Its controls, its labels and its disabled
 * reasons are covered by the interface and accessibility suites, which read the
 * screen rather than photograph it.
 */
const screens = [
  { path: "/", name: "dashboard" },
  { path: "/borrow/", name: "borrow" },
  { path: "/pool/", name: "pool" },
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
        animations: "disabled",
        mask: [page.locator("[data-figure]")]
      })
    })
  }
})
