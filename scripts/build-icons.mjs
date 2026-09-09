// Renders the touch icons from the Safix mark. iOS and Android composite a home
// screen icon onto their own background and ignore transparency, so the mark is
// placed on the carbon canvas here rather than shipped with an alpha channel.
//
//   npm run build:icons

import { createRequire } from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { ImageResponse } = require("next/og.js")

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(root, "app", "icon.png")
const CARBON = "#070c0c"

const mark = `data:image/png;base64,${readFileSync(source).toString("base64")}`

// Every size is rendered from the 256px master, so nothing here is scaled up
// beyond it. A larger master would be needed before adding sizes above 256.
const TARGETS = [
  { path: ["app", "apple-icon.png"], size: 180, inset: 0.16 },
  { path: ["public", "icons", "icon-192.png"], size: 192, inset: 0.14 },
  { path: ["public", "icons", "icon-256.png"], size: 256, inset: 0.14 }
]

const card = (size, inset) => ({
  type: "div",
  props: {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      background: CARBON
    },
    children: {
      type: "img",
      props: {
        src: mark,
        width: Math.round(size * (1 - inset * 2)),
        height: Math.round(size * (1 - inset * 2))
      }
    }
  }
})

async function main() {
  for (const target of TARGETS) {
    const response = new ImageResponse(card(target.size, target.inset), {
      width: target.size,
      height: target.size
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.subarray(1, 4).toString() !== "PNG") {
      console.error(`build-icons: render for ${target.path.join("/")} is not a PNG`)
      process.exit(1)
    }
    const file = join(root, ...target.path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, buffer)
    console.log(`icon ${target.path.join("/")}  ${target.size}x${target.size}  (${buffer.length} bytes)`)
  }
}

main()
