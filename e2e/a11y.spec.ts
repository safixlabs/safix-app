import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { givenCollateral, givenDebt, snapshotChain, revertChain, tbill } from "./chain"
import { connect, installWallet } from "./wallet"

/**
 * A screen with something on it.
 *
 * These assertions are about controls a person reaches only once there is a
 * position to act on, and this interface has no second source of numbers: the
 * position is opened on the chain the suite runs against, then rolled back.
 */
const withPosition = async (page: Page, open: () => Promise<void>) => {
  const snapshot = await snapshotChain()
  await installWallet(page)
  await open()
  return async () => {
    await revertChain(snapshot)
  }
}

const screens = ["/", "/borrow/", "/pool/", "/partnerships/", "/passport/", "/assets/", "/risk/", "/terms/"]

const widths = [
  { name: "360 · small phone", width: 360, height: 780 },
  { name: "390 · phone", width: 390, height: 844 },
  { name: "768 · tablet", width: 768, height: 1024 },
  { name: "1024 · small laptop", width: 1024, height: 768 },
  { name: "1440 · desktop", width: 1440, height: 900 }
]

type Focused = {
  signature: string
  name: string
  visibleRing: boolean
  focusVisible: boolean
}

const readFocus = (page: Page) =>
  page.evaluate<Focused | null>(() => {
    const element = document.activeElement as HTMLElement | null
    if (!element || element === document.body || element === document.documentElement) return null
    if (element.tagName.startsWith("NEXTJS")) return null
    const style = getComputedStyle(element)
    const ring =
      (parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== "none") ||
      style.boxShadow !== "none"
    const label =
      element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 48) ?? ""
    return {
      signature: `${element.tagName}:${label}:${(element as HTMLAnchorElement).href ?? ""}`,
      name: `${element.tagName.toLowerCase()} "${label}"`,
      visibleRing: ring,
      focusVisible: element.matches(":focus-visible")
    }
  })

// Walks the page with Tab the way a keyboard user would, and reports what it passed.
async function tabThrough(page: Page, limit = 40) {
  const seen: Focused[] = []
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab")
    const focused = await readFocus(page)
    if (!focused) break
    if (seen.some(item => item.signature === focused.signature)) break
    seen.push(focused)
  }
  return seen
}

test.describe("keyboard", () => {
  for (const path of screens) {
    test(`every interactive element on ${path} takes focus visibly`, async ({ page }) => {
      await page.goto(path)
      const stops = await tabThrough(page)

      expect(stops.length, `${path} has no keyboard stops`).toBeGreaterThan(4)
      const invisible = stops.filter(stop => !stop.visibleRing || !stop.focusVisible)
      expect(invisible.map(stop => stop.name), `${path} focuses these with no visible ring`).toEqual([])
    })
  }

  test("the skip link is the first stop and jumps to the content", async ({ page }) => {
    await page.goto("/pool/")
    await page.keyboard.press("Tab")
    const skip = page.getByRole("link", { name: "Skip to content" })
    await expect(skip).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#main$/)
  })

  test("a draw can be prepared with the keyboard alone", async ({ page }) => {
    const rollback = await withPosition(page, () => givenCollateral(tbill))
    await page.goto("/borrow/")
    await connect(page)
    const amount = page.getByLabel("Amount of USDG to draw")
    const max = page.getByRole("button", { name: /Use the maximum USDG to draw/ })

    // The ceiling is read from the chain, so the control is disabled until the
    // read lands. focus() and press() do not wait for that the way click() does.
    await expect(max).toBeEnabled()
    await max.focus()
    await page.keyboard.press("Enter")
    await expect(amount).not.toHaveValue("")

    // The maximum draw lands near liquidation, so the gate below has to be cleared too.
    const acknowledgement = page.getByRole("checkbox")
    await acknowledgement.focus()
    await page.keyboard.press("Space")
    await expect(acknowledgement).toBeChecked()
    await expect(page.getByRole("button", { name: /Draw/ })).toBeEnabled()
    await rollback()
  })
})

test.describe("risk gate", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "ethereum", {
        value: { isMetaMask: true, request: async () => [], on: () => {}, removeListener: () => {} },
        writable: true
      })
      window.localStorage.removeItem("safix.risk.acknowledged")
    })
  })

  test("traps focus, closes on Escape and hands focus back", async ({ page }) => {
    await page.goto("/pool/")
    const connect = page.getByRole("button", { name: /Connect wallet|No wallet detected/ })
    await connect.focus()
    await page.keyboard.press("Enter")

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Visible is not enough: the header's backdrop-filter once made it the containing
    // block for the gate, which laid the dialog out inside the navigation bar.
    const viewport = page.viewportSize()!
    const overlay = await dialog.locator("xpath=..").boundingBox()
    expect(overlay!.width, "the overlay must cover the viewport").toBeGreaterThanOrEqual(viewport.width - 1)
    expect(overlay!.height, "the overlay must cover the viewport").toBeGreaterThanOrEqual(viewport.height - 1)
    const box = (await dialog.boundingBox())!
    expect(box.width).toBeGreaterThan(320)
    expect(box.height).toBeGreaterThan(240)

    await expect(await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))).toBe(true)

    // Tab all the way round: focus must never leave the dialog.
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press("Tab")
      const inside = await page.evaluate(() =>
        document.querySelector('[role="dialog"]')?.contains(document.activeElement)
      )
      expect(inside, `focus escaped the dialog after ${step + 1} tabs`).toBe(true)
    }

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(connect).toBeFocused()
  })

  test("Continue says why it is held back until the box is ticked", async ({ page }) => {
    await page.goto("/pool/")
    await page.getByRole("button", { name: /Connect wallet|No wallet detected/ }).click()
    const dialog = page.getByRole("dialog")
    const proceed = dialog.getByRole("button", { name: "Continue" })

    await expect(proceed).toBeDisabled()
    await expect(proceed).toHaveAccessibleDescription("Tick the box above to continue.")
    await expect(dialog.getByText("Tick the box above to continue.")).toBeVisible()

    await dialog.getByRole("checkbox").check()
    await expect(proceed).toBeEnabled()
    await expect(dialog.getByText("Tick the box above to continue.")).toBeHidden()
  })
})

test.describe("responsive", () => {
  for (const size of widths) {
    test(`nothing overflows at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      for (const path of screens) {
        await page.goto(path)
        const report = await page.evaluate(() => {
          const doc = document.documentElement
          const offenders: string[] = []
          const scrolls = (node: Element | null): boolean => {
            for (let current = node; current; current = current.parentElement) {
              const overflow = getComputedStyle(current).overflowX
              if (overflow === "auto" || overflow === "scroll") return true
            }
            return false
          }
          for (const element of Array.from(document.body.querySelectorAll("*"))) {
            if (element.tagName.startsWith("NEXTJS")) continue
            const box = element.getBoundingClientRect()
            if (box.width === 0 || box.height === 0) continue
            // A deliberate scroll container is not a broken layout.
            if (scrolls(element.parentElement)) continue
            if (box.right > doc.clientWidth + 1 || box.left < -1) {
              const node = element as HTMLElement
              offenders.push(
                `${node.tagName.toLowerCase()}.${node.className?.toString().slice(0, 40)} → ${Math.round(box.left)}…${Math.round(box.right)}`
              )
            }
          }
          return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: offenders.slice(0, 6) }
        })
        expect(report.offenders, `${path} at ${size.width}px`).toEqual([])
        expect(report.scrollWidth, `${path} at ${size.width}px scrolls sideways`).toBeLessThanOrEqual(
          report.clientWidth + 1
        )
      }
    })
  }

  test("the wallet button is reachable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto("/pool/")
    await expect(page.getByRole("button", { name: /Connect wallet|No wallet detected/ })).toBeVisible()
  })
})

// WCAG 2.2 · 2.5.8 asks for 24×24 CSS pixels. A link inside a sentence is exempt, an
// input's target is the label that toggles it, and the skip link only exists once it
// has focus.
const undersizedTargets = (page: Page) =>
  page.evaluate(() => {
    const problems: string[] = []
    const selector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (element.tagName.startsWith("NEXTJS")) continue
      if (element.matches(".sr-only")) continue
      const label = element.closest("label")
      const target = element instanceof HTMLInputElement && label ? label : element
      if (element.tagName === "A" && element.closest("p, label")) continue
      const box = target.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      if (box.width < 24 || box.height < 24) {
        const name = element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 32)
        problems.push(`${element.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}×${Math.round(box.height)}`)
      }
    }
    return problems
  })

test.describe("target size", () => {
  for (const width of [360, 1440]) {
    test(`every target is at least 24 by 24 at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const path of screens) {
        await page.goto(path)
        expect(await undersizedTargets(page), `${path} at ${width}px`).toEqual([])
      }
    })
  }

  test("the liquidation acknowledgement is large enough to hit", async ({ page }) => {
    const rollback = await withPosition(page, () => givenCollateral(tbill))
    await page.setViewportSize({ width: 360, height: 900 })
    await page.goto("/borrow/")
    await connect(page)
    await page.getByRole("button", { name: "Use the maximum USDG to draw" }).click()
    await expect(page.getByRole("checkbox")).toBeVisible()
    expect(await undersizedTargets(page)).toEqual([])
    await rollback()
  })

  test("the risk gate's controls are large enough to hit", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "ethereum", {
        value: { isMetaMask: true, request: async () => [], on: () => {}, removeListener: () => {} },
        writable: true
      })
      window.localStorage.removeItem("safix.risk.acknowledged")
    })
    await page.setViewportSize({ width: 360, height: 900 })
    await page.goto("/pool/")
    await page.getByRole("button", { name: /Connect wallet|No wallet detected/ }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    expect(await undersizedTargets(page)).toEqual([])
  })
})

test.describe("screen reader", () => {
  test("every control and image on the money screens is named", async ({ page }) => {
    for (const path of ["/borrow/", "/pool/", "/partnerships/"]) {
      await page.goto(path)
      const unnamed = await page.evaluate(() => {
        const problems: string[] = []
        for (const input of Array.from(document.querySelectorAll("input"))) {
          const named =
            input.getAttribute("aria-label") ||
            input.labels?.length ||
            document.querySelector(`label[for="${input.id}"]`)
          if (!named) problems.push(`input[${input.type}] with placeholder "${input.placeholder}"`)
        }
        for (const button of Array.from(document.querySelectorAll("button"))) {
          const named = button.getAttribute("aria-label") || button.textContent?.trim()
          if (!named) problems.push(`button ${button.outerHTML.slice(0, 60)}`)
        }
        for (const image of Array.from(document.querySelectorAll("img"))) {
          if (image.getAttribute("alt") === null) problems.push(`img ${image.getAttribute("src")}`)
        }
        return problems
      })
      expect(unnamed, `unnamed controls on ${path}`).toEqual([])
    }
  })

  // A grey button says nothing. Every control that is disabled has to point, through
  // aria-describedby, at a sentence that is on screen: text a screen reader reads
  // with the control and a sighted user can see, not a tooltip only a mouse reaches.
  test("every disabled control on the money screens says why", async ({ page }) => {
    for (const path of ["/borrow/", "/pool/", "/partnerships/"]) {
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      const silent = await page.evaluate(() => {
        const problems: string[] = []
        for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("button:disabled"))) {
          const name = button.getAttribute("aria-label") ?? button.textContent?.trim().slice(0, 40) ?? ""
          if (button.hasAttribute("title")) problems.push(`"${name}" leans on a title attribute`)
          const reasons = (button.getAttribute("aria-describedby") ?? "")
            .split(/\s+/)
            .filter(Boolean)
            .map(id => document.getElementById(id))
            .filter((node): node is HTMLElement => Boolean(node))
            .filter(node => {
              const box = node.getBoundingClientRect()
              // A visually hidden node is 1px; a reason has to be readable on screen too.
              return Boolean(node.textContent?.trim()) && node.checkVisibility() && box.width > 1 && box.height > 1
            })
          if (reasons.length === 0) problems.push(`"${name}" is disabled with no reason on screen`)
        }
        return problems
      })
      expect(silent, `disabled controls without a reason on ${path}`).toEqual([])
    }
  })

  test("the health bar reports its state, not just a colour", async ({ page }) => {
    const rollback = await withPosition(page, () => givenDebt(tbill))
    await page.goto("/")
    await connect(page)
    const bar = page.getByRole("progressbar").first()
    await expect(bar).toHaveAttribute("aria-valuetext", /percent, (Safe|Tight|At risk|Liquidatable)/)
    await rollback()
  })
})

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } })

  test("animation is stripped when the system asks for it", async ({ page }) => {
    await page.goto("/pool/")
    const durations = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter(element => !element.tagName.startsWith("NEXTJS"))
        .map(element => getComputedStyle(element))
        .filter(style => style.transitionDuration !== "0s" || style.animationDuration !== "0s")
        .flatMap(style => [style.transitionDuration, style.animationDuration])
        .filter(value => value !== "0s")
    )
    for (const duration of durations) {
      expect(Number.parseFloat(duration), `${duration} still animates`).toBeLessThan(0.01)
    }
  })
})
