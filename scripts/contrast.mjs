#!/usr/bin/env node
// Measures WCAG 2.1 contrast for every text token against every surface it can sit on,
// in both themes. Translucent surfaces are composited over the animated backdrop, so a
// panel is measured against the worst frame the shader can paint behind it, not against
// the flat token colour.
//
//   node scripts/contrast.mjs

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const AA_TEXT = 4.5
const AA_LARGE = 3
const AA_NON_TEXT = 3

const hexToRgb = hex => {
  const value = hex.replace("#", "")
  const full = value.length === 3 ? [...value].map(char => char + char).join("") : value
  return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16))
}

const rgbToHex = rgb => `#${rgb.map(part => Math.round(part).toString(16).padStart(2, "0")).join("")}`

// Browsers composite opacity in sRGB, so blend there too.
const over = (foreground, background, alpha) =>
  foreground.map((part, index) => part * alpha + background[index] * (1 - alpha))

const luminance = rgb => {
  const [r, g, b] = rgb.map(part => {
    const channel = part / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

const blockOf = (css, selector) => {
  const start = css.indexOf(selector)
  if (start === -1) return null
  const open = css.indexOf("{", start)
  const close = css.indexOf("}", open)
  return css.slice(open + 1, close)
}

const declarationsOf = block => {
  const tokens = {}
  for (const [, name, value] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens[name] = value.trim()
  }
  return tokens
}

const resolve = tokens => {
  const seen = new Map()
  const lookup = name => {
    if (seen.has(name)) return seen.get(name)
    const raw = tokens[name]
    if (!raw) return undefined
    const reference = raw.match(/^var\((--[a-z0-9-]+)\)$/i)
    const value = reference ? lookup(reference[1]) : raw
    seen.set(name, value)
    return value
  }
  return Object.fromEntries(Object.keys(tokens).map(name => [name, lookup(name)]))
}

const css = await readFile(join(root, "app/globals.css"), "utf8")
const backdropSource = await readFile(join(root, "components/Backdrop.tsx"), "utf8")

const base = declarationsOf(blockOf(css, ":root {"))
const explicitLight = declarationsOf(blockOf(css, ':root[data-theme="light"]'))
const systemLight = declarationsOf(blockOf(css, ':root:not([data-theme="dark"])'))

const themes = {
  dark: resolve(base),
  light: resolve({ ...base, ...explicitLight })
}
const systemLightTheme = resolve({ ...base, ...systemLight })

// The backdrop shader mixes its background with four accent colours, so any of the five
// can end up behind a translucent panel.
const paletteOf = theme => {
  const block = backdropSource.match(new RegExp(`${theme}:\\s*\\{([^}]+)\\}`))
  if (!block) throw new Error(`no ${theme} palette found in components/Backdrop.tsx`)
  return [...block[1].matchAll(/#[0-9a-f]{6}/gi)].map(match => match[0])
}

const surfacesOf = theme => {
  const token = name => hexToRgb(theme["--" + name])
  const canvas = token("surface-canvas")
  const panel = token("surface-panel")
  const backdropAlpha = Number(theme["--backdrop-opacity"])

  return palette => {
    const shader = hexToRgb(palette)
    const litCanvas = over(shader, canvas, backdropAlpha)
    const panel80 = over(panel, litCanvas, 0.8)
    return {
      canvas: litCanvas,
      panel: panel80,
      // Fields and asset rows sit inside a panel with their own translucent fill.
      field: over(canvas, panel80, 0.6),
      row: over(canvas, panel80, 0.3),
      nav: over(canvas, litCanvas, 0.8),
      accent: token("accent"),
      line: token("border-hairline"),
      control: token("border-control")
    }
  }
}

// Every text role, the surfaces it actually appears on, and the threshold that applies.
const checks = [
  { token: "text-strong", on: ["canvas", "panel", "field", "row", "nav"], need: AA_TEXT, note: "headings, values, input text" },
  { token: "text-body", on: ["canvas", "panel", "field", "row", "nav"], need: AA_TEXT, note: "body copy" },
  { token: "text-muted", on: ["canvas", "panel", "field", "row", "nav"], need: AA_TEXT, note: "labels, hints, placeholders" },
  { token: "accent", on: ["canvas", "panel", "nav"], need: AA_TEXT, note: "links, active nav, focus ring" },
  { token: "accent-strong", on: ["canvas", "panel"], need: AA_TEXT, note: "link hover" },
  { token: "warning", on: ["panel", "row"], need: AA_TEXT, note: "at-risk health" },
  { token: "critical", on: ["panel", "row"], need: AA_TEXT, note: "liquidatable health" },
  { token: "on-accent", on: ["accent"], need: AA_TEXT, note: "primary button label" },
  { token: "text-muted", on: ["line"], need: AA_TEXT, note: "disabled button label" },
  { token: "accent", on: ["canvas", "panel", "field"], need: AA_NON_TEXT, note: "focus ring against its surface" },
  // 1.4.11 applies to the borders that identify a control. Panel edges and dividers are
  // decorative, carry no state, and stay on the hairline token.
  { token: "border-control", on: ["panel", "canvas", "field", "row"], need: AA_NON_TEXT, note: "input, button and row borders" }
]

let failures = 0
const rows = []

for (const [name, theme] of Object.entries(themes)) {
  const build = surfacesOf(theme)
  const palettes = paletteOf(name)

  for (const check of checks) {
    const foreground = hexToRgb(theme["--" + check.token])
    for (const surfaceName of check.on) {
      // Worst frame the backdrop can paint behind this surface.
      let worst = Infinity
      let worstSurface = null
      for (const palette of palettes) {
        const surface = build(palette)[surfaceName]
        const ratio = contrast(foreground, surface)
        if (ratio < worst) {
          worst = ratio
          worstSurface = surface
        }
      }
      const passed = worst >= check.need
      if (!passed) failures += 1
      rows.push({
        theme: name,
        pair: `${check.token} on ${surfaceName}`,
        ratio: worst,
        need: check.need,
        passed,
        detail: `${rgbToHex(foreground)} on ${rgbToHex(worstSurface)} · ${check.note}`
      })
    }
  }
}

// The two light definitions (explicit toggle, system preference) must not drift apart.
const drift = Object.keys(themes.light)
  .filter(name => name.startsWith("--") && themes.light[name] !== systemLightTheme[name])
  .map(name => `${name}: toggle ${themes.light[name]} vs system ${systemLightTheme[name]}`)

const pad = (value, width) => String(value).padEnd(width)

console.log(`\n  WCAG AA contrast · ${rows.length} pairs measured through the backdrop\n`)
for (const row of rows) {
  const mark = row.passed ? "pass" : "FAIL"
  console.log(
    `  ${mark}  ${pad(row.theme, 6)} ${pad(row.pair, 34)} ${row.ratio.toFixed(2).padStart(6)}:1  (needs ${row.need})  ${row.detail}`
  )
}

if (drift.length > 0) {
  console.log("\n  Light theme drift between the toggle and the system preference:")
  for (const line of drift) console.log(`  FAIL  ${line}`)
}

const total = failures + drift.length
console.log(
  total === 0
    ? `\n  All ${rows.length} pairs pass AA in both themes.\n`
    : `\n  ${total} failing check${total === 1 ? "" : "s"}.\n`
)

process.exit(total === 0 ? 0 : 1)
