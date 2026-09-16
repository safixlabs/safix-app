import { expect, test } from "@playwright/test"
import config from "../site.config.json"

const surfaces: Record<string, { role: string; subdomain: string | null; currentUrl: string | null }> =
  config.surfaces
const domain = process.env.NEXT_PUBLIC_SAFIX_DOMAIN ?? config.domain

const urlOf = (surface: { subdomain: string | null; currentUrl: string | null }) =>
  domain ? `https://${surface.subdomain ? `${surface.subdomain}.` : ""}${domain}` : surface.currentUrl
import type { Locator, Page } from "@playwright/test"

async function clickWhenLive(page: Page, button: Locator, settled: () => Promise<void>) {
  await expect(async () => {
    await button.click()
    await settled()
  }).toPass({ timeout: 30_000 })
}

test.describe("interface", () => {
  test("every screen renders with its heading", async ({ page }) => {
    const screens: [string, string][] = [
      ["/", "Overview"],
      ["/borrow/", "Borrow"],
      ["/pool/", "Stability pool"],
      ["/partnerships/", "Partnerships"],
      ["/passport/", "Credit passport"],
      ["/risk/", "Risk disclosure"],
      ["/terms/", "Terms of use"]
    ]
    for (const [path, heading] of screens) {
      await page.goto(path)
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible()
    }
  })

  test("theme switches and survives navigation", async ({ page }) => {
    await page.goto("/pool/")
    const toggle = page.getByRole("button", { name: /Switch to (light|dark) theme/ })
    const before = await page.evaluate(() => document.documentElement.dataset.theme)
    await clickWhenLive(page, toggle, async () => {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme), { timeout: 3_000 })
        .not.toBe(before)
    })
    const after = await page.evaluate(() => document.documentElement.dataset.theme)

    await page.goto("/borrow/")
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after)
  })

  test("risk gate blocks connecting until acknowledged", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "ethereum", {
        value: { isMetaMask: true, request: async () => [], on: () => {}, removeListener: () => {} },
        writable: true
      })
    })
    await page.goto("/pool/")
    const dialog = page.getByRole("dialog")
    await clickWhenLive(page, page.getByRole("button", { name: /Connect wallet|No wallet detected/ }), async () => {
      await expect(dialog).toBeVisible({ timeout: 3_000 })
    })
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled()

    await dialog.getByRole("checkbox").check()
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled()
  })

  test("borrow preview reacts to the amount and warns near liquidation", async ({ page }) => {
    await page.goto("/borrow/")
    const amount = page.getByPlaceholder("0.00").first()
    await clickWhenLive(page, page.getByRole("button", { name: "Use the maximum USDG to draw" }), async () => {
      await expect(amount).not.toHaveValue("", { timeout: 3_000 })
    })

    await expect(page.getByText("Liquidation price after")).toBeVisible()
    await expect(page.getByText("I understand the risk")).toBeVisible()
    await expect(page.getByRole("button", { name: /Acknowledge the liquidation risk first|Draw/ })).toBeVisible()
  })

  // A price without an age teaches that the question does not exist. It does: the
  // pool refuses to act on a price past the age its own guard allows.
  test("a quoted price says how old it is", async ({ page }) => {
    await page.goto("/borrow/")
    await expect(page.getByText(/^priced /).first()).toBeVisible()

    await page.goto("/")
    await expect(page.getByText(/, priced /).first()).toBeVisible()
  })

  test("pool preview updates the resulting deposit and share", async ({ page }) => {
    await page.goto("/pool/")
    const amount = page.getByPlaceholder("0.00").first()
    await clickWhenLive(page, page.getByRole("button", { name: "Use 50 percent of USDG to deposit" }), async () => {
      await expect(amount).not.toHaveValue("", { timeout: 3_000 })
    })
    await expect(page.getByText("Your deposit after")).toBeVisible()
    await expect(page.getByText("Share of pool after")).toBeVisible()
  })

  test("documentation and legal links are reachable from the footer", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("link", { name: "Risk" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible()

    // The cross-links are resolved from site.config.json rather than typed, so
    // this asserts against the same configuration the app builds from. When the
    // apex domain is registered, both the app and this test follow it.
    for (const [key, surface] of Object.entries(surfaces)) {
      if (key === "app") continue
      const expected = urlOf(surface)
      if (!expected) continue
      const label = key === "marketing" ? "Safix" : surface.role
      const link = page.getByRole("contentinfo").getByRole("link", { name: new RegExp(`^${label}`) })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute("href", expected)
    }
  })
})
