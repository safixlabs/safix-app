import { expect, test } from "@playwright/test"
import {
  AGEING_FRACTION,
  agoWords,
  durationWords,
  priceAgeLine,
  priceFreshness,
  priceVerdict,
  reconcileFreshness
} from "../lib/price"

/**
 * The price age rules, checked against the contract's own comparison.
 *
 * `SafixPool` treats a price as stale when `block.timestamp - updatedAt` is
 * strictly greater than the asset's `maxPriceAge`, so a price exactly at the
 * limit is still one the pool will act on. A screen that rounds that the other
 * way would refuse a draw the chain would have taken.
 */

const HOUR = 3_600
const DAY = 86_400
const now = 1_800_000_000

test.describe("price age", () => {
  test("a price is stale only once it is past the asset's own limit", () => {
    const at = (age: number, maxAge: number) => priceFreshness(now - age, maxAge, now).state

    expect(at(HOUR, HOUR), "exactly at the limit, as the contract compares it").toBe("ageing")
    expect(at(HOUR + 1, HOUR)).toBe("stale")
    expect(at(HOUR - 1, HOUR)).toBe("ageing")
    expect(at(Math.floor(HOUR * AGEING_FRACTION) - 1, HOUR)).toBe("fresh")
    // The same age against a different asset's guard: an hour is nothing to a daily one.
    expect(at(HOUR, DAY)).toBe("fresh")
    expect(at(DAY + 1, DAY)).toBe("stale")
  })

  test("an asset with no guard has an age but no limit", () => {
    const freshness = priceFreshness(now - 9 * DAY, null, now)
    expect(freshness.state).toBe("fresh")
    expect(freshness.maxAge).toBeNull()
    expect(priceAgeLine(freshness)).toBe("priced 9 days ago")
  })

  test("a price that was never posted says so rather than reading as new", () => {
    const freshness = priceFreshness(0, HOUR, now)
    expect(freshness.state).toBe("unpriced")
    expect(priceAgeLine(freshness)).toBe("never priced")
  })

  test("the age reads as somebody would say it", () => {
    expect(agoWords(5)).toBe("moments ago")
    expect(agoWords(60)).toBe("a minute ago")
    expect(agoWords(40 * 60)).toBe("40 minutes ago")
    expect(agoWords(HOUR)).toBe("an hour ago")
    expect(agoWords(3 * HOUR)).toBe("3 hours ago")
    expect(agoWords(DAY)).toBe("a day ago")
    expect(agoWords(2 * DAY)).toBe("2 days ago")
    expect(durationWords(HOUR)).toBe("an hour")
    expect(durationWords(DAY)).toBe("a day")
  })

  test("the line says what the price is past, in the asset's own terms", () => {
    expect(priceAgeLine(priceFreshness(now - 40 * 60, DAY, now))).toBe("priced 40 minutes ago")
    expect(priceAgeLine(priceFreshness(now - 2 * DAY, DAY, now))).toBe(
      "priced 2 days ago, past the day this asset allows"
    )
    expect(priceAgeLine(priceFreshness(now - 50 * 60, HOUR, now))).toBe(
      "priced 50 minutes ago, close to the hour this asset allows"
    )
    expect(priceAgeLine(priceFreshness(now - 5 * HOUR, 4 * HOUR, now))).toBe(
      "priced 5 hours ago, past the 4 hours this asset allows"
    )
  })

  // The contract decides; the interface reports. A pool with no such guard
  // refuses nothing for age, and the screen must not invent a refusal.
  test("the refusal comes from the pool's own verdict, not from this clock", () => {
    expect(priceVerdict(null).usable, "a pool with no price guard").toBe(true)
    expect(priceVerdict(0).usable, "PriceStatus.Ok").toBe(true)
    const stale = priceVerdict(5)
    expect(stale.usable).toBe(false)
    expect(stale.label).toBe("Price too old to draw against")
    expect(stale.note).toContain("once the price is updated")
    for (const status of [1, 2, 3, 4, 6, 7, 8]) {
      const verdict = priceVerdict(status)
      expect(verdict.usable, `PriceStatus ${status}`).toBe(false)
      expect(verdict.label, `PriceStatus ${status}`).toBeTruthy()
      expect(verdict.note, `PriceStatus ${status}`).toBeTruthy()
    }
  })

  // The age is this browser's reading; the refusal is the pool's. Where the two
  // clocks disagree, the line follows the pool, so it never contradicts the button.
  test("the line follows the pool's verdict when this clock disagrees with the chain's", () => {
    const localFresh = priceFreshness(now - 10 * 60, HOUR, now)
    expect(reconcileFreshness(localFresh, 5).state, "the pool says stale").toBe("stale")
    expect(priceAgeLine(reconcileFreshness(localFresh, 5))).toBe("priced 10 minutes ago, past the hour this asset allows")

    const localStale = priceFreshness(now - HOUR - 30, HOUR, now)
    expect(reconcileFreshness(localStale, 0).state, "the pool still acts on it").toBe("ageing")

    // No verdict to follow: an older pool, or a price never posted.
    expect(reconcileFreshness(localStale, null)).toEqual(localStale)
    expect(reconcileFreshness(priceFreshness(0, HOUR, now), 5).state).toBe("unpriced")
  })

  test("a clock that runs behind the chain never reads as a price from the future", () => {
    expect(priceFreshness(now + 30, HOUR, now).age).toBe(0)
  })
})
