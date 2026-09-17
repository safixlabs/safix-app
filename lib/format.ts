/**
 * One formatter per kind of number, so a figure reads the same on every screen.
 *
 * Money is always two decimals; asset prices keep four below a dollar, where the
 * cents alone would hide the movement; token amounts are always four.
 */
export const usd = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

export const price = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2
  })

export const tokenAmount = (value: number) => value.toFixed(4)

export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`
