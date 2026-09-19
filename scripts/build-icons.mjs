// Renders every touch and launcher icon from the finished Safix icon.
//
//   npm run build:icons
//
// The source is `assets/brand/icon.png`, the icon as the brand kit draws it:
// the mark on its own field, with its own corner radius. It is not composited
// onto a canvas here. iOS and Android ignore transparency and apply their own
// mask, and an icon that already carries its field survives both, as well as a
// light browser tab where a bare mark would disappear.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(root, "assets", "brand", "icon.png")

// Every size is a downsample of the 512px master, so nothing is scaled up.
const TARGETS = [
  { path: ["app", "icon.png"], size: 256 },
  { path: ["app", "apple-icon.png"], size: 180 },
  { path: ["public", "icons", "icon-192.png"], size: 192 },
  { path: ["public", "icons", "icon-256.png"], size: 256 },
  { path: ["public", "icons", "icon-512.png"], size: 512 }
]

async function main() {
  const master = readFileSync(source)
  const { width } = await sharp(master).metadata()
  const largest = Math.max(...TARGETS.map(target => target.size))
  if (!width || width < largest) {
    console.error(`build-icons: master is ${width}px, too small for a ${largest}px icon`)
    process.exit(1)
  }

  for (const target of TARGETS) {
    const buffer = await sharp(master)
      .resize(target.size, target.size, { kernel: "lanczos3" })
      .png({ compressionLevel: 9 })
      .toBuffer()
    const file = join(root, ...target.path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, buffer)
    console.log(`icon ${target.path.join("/")}  ${target.size}x${target.size}  (${buffer.length} bytes)`)
  }
}

main()
