// Renders the social preview image for every documentation page into
// public/og/. One image per page, carrying that page's own title, so a link
// shared to any page in this site previews as that page rather than as a
// generic card.
//
//   npm run build:og
//
// The page list comes from components/nav.ts, so a page added to the surface
// gets an image without this script being touched.

import { createRequire } from "node:module"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { ImageResponse } = require("next/og.js")

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "public", "og")

const fail = message => {
  console.error(`build-og: ${message}`)
  process.exit(1)
}

const read = path => {
  try {
    return readFileSync(join(root, path))
  } catch {
    return fail(`missing ${path}`)
  }
}

// Brand tokens, kept in step with app/globals.css by hand only here, because an
// image has no CSS custom properties to read.
const CARBON = "#070c0c"
const PANEL = "#0d1615"
const MINT = "#10e7c0"
const FOG = "#e9f2ee"
const HAZE = "#8ea09a"
const LINE = "#1d2b28"

const fonts = [
  { name: "DM Sans", data: read("assets/fonts/DMSans-Regular.ttf"), weight: 400, style: "normal" },
  { name: "DM Sans", data: read("assets/fonts/DMSans-Bold.ttf"), weight: 700, style: "normal" }
]

const mark = `data:image/png;base64,${read("app/icon.png").toString("base64")}`

const surfaces = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"))
const here = surfaces.surfaces.app
const apex = process.env.NEXT_PUBLIC_SAFIX_DOMAIN ?? surfaces.domain
const host = apex
  ? `${here.subdomain ? `${here.subdomain}.` : ""}${apex}`
  : (here.currentUrl ?? "").replace(/^https?:\/\//, "")

function readPages() {
  const source = readFileSync(join(root, "components", "nav.ts"), "utf8")
  const entries = [...source.matchAll(/\{\s*href:\s*"([^"]+)",\s*title:\s*"([^"]+)"\s*\}/g)].map(match => ({
    href: match[1],
    title: match[2]
  }))
  const primary = new Set(
    [...(source.match(/export const appLinks = \[([\s\S]*?)\n\]/)?.[1] ?? "").matchAll(/href:\s*"([^"]+)"/g)].map(
      match => match[1]
    )
  )
  const seen = new Set()
  const pages = entries
    .filter(entry => (seen.has(entry.href) ? false : seen.add(entry.href)))
    .map(entry => ({ ...entry, group: primary.has(entry.href) ? "App" : "Legal" }))
  if (pages.length === 0) fail("components/nav.ts yielded no pages")
  return pages
}

export const slugOf = href => {
  const trimmed = href.replace(/^\/+|\/+$/g, "")
  return trimmed === "" ? "index" : trimmed.replace(/\//g, "-")
}

const el = (type, props) => ({ type, props })

function card({ title, group }) {
  return el("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      background: CARBON,
      fontFamily: "DM Sans",
      padding: "72px 80px",
      borderTop: `10px solid ${MINT}`
    },
    children: [
      el("div", {
        style: { display: "flex", alignItems: "center", gap: 20 },
        children: [
          el("img", { src: mark, width: 68, height: 68 }),
          el("div", {
            style: { display: "flex", flexDirection: "column" },
            children: [
              el("div", {
                style: { display: "flex", fontSize: 40, fontWeight: 700, color: FOG, letterSpacing: "-0.02em" },
                children: "Safix"
              }),
              el("div", {
                style: { display: "flex", fontSize: 21, color: HAZE, letterSpacing: "-0.01em", marginTop: 2 },
                children: here.role
              })
            ]
          })
        ]
      }),
      el("div", {
        style: { display: "flex", flexDirection: "column" },
        children: [
          el("div", {
            style: {
              display: "flex",
              fontSize: 22,
              color: MINT,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 700
            },
            children: group
          }),
          el("div", {
            style: {
              display: "flex",
              fontSize: title.length > 26 ? 82 : 96,
              fontWeight: 700,
              color: FOG,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              marginTop: 22
            },
            children: title
          })
        ]
      }),
      el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `2px solid ${LINE}`,
          paddingTop: 26,
          fontSize: 24,
          color: HAZE,
          letterSpacing: "-0.01em"
        },
        children: [
          el("div", { style: { display: "flex" }, children: host }),
          el("div", {
            style: {
              display: "flex",
              background: PANEL,
              border: `2px solid ${LINE}`,
              color: MINT,
              padding: "8px 18px",
              fontSize: 21
            },
            children: "Private credit for tokenized assets"
          })
        ]
      })
    ]
  })
}

async function main() {
  const pages = readPages()
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  for (const page of pages) {
    const response = new ImageResponse(card(page), { width: 1200, height: 630, fonts })
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.subarray(1, 4).toString() !== "PNG") fail(`render for ${page.href} is not a PNG`)
    const file = join(outDir, `${slugOf(page.href)}.png`)
    writeFileSync(file, buffer)
    console.log(`og ${slugOf(page.href)}.png  ${page.title}  (${buffer.length} bytes)`)
  }
  console.log(`build-og: wrote ${pages.length} image(s) to public/og`)
}

main()
