// Fits every token logo to the circle the interface draws it in.
//
//   node scripts/fit-token-logos.mjs
//
// The logos come from an equity logo host, which serves whatever a company
// publishes: a symbol, a wordmark on a coloured tile, or a marketing card. A
// circle accepts only the first of those, so each one is measured and handled
// for what it is rather than scaled to fit and hoped for.
//
// Run by `sync-tokens` after a download, and safe to run on its own: the work
// is idempotent, since a logo already fitted measures the same the second time.

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const logos = join(root, "public", "tokens")
const registryPath = join(root, "data", "tokens.mainnet.json")

const SIZE = 256

// Past this, a mark is a wordmark rather than a symbol. Corning's is 6.6 to 1:
// inscribed in a circle at the size these are drawn, it is a grey smear. The
// interface shows the ticker instead, which at least says which asset it is.
const READABLE_RATIO = 1.8

// A circle has no corners, so a mark's diagonal is what has to fit inside it,
// not its width. The margin keeps it off the border.
const inscribe = (width, height) => (SIZE * 0.94) / Math.hypot(width, height)

async function fit(file) {
  const image = sharp(join(logos, file))
  // An alpha channel can exist and still be fully opaque, which is how a tile
  // arrives. Asking the channel what it holds separates a tile from a mark on
  // transparency; asking whether the channel exists does not.
  const stats = await image.stats()
  const alpha = stats.channels[3]
  const opaque = !alpha || alpha.min === 255

  if (opaque) {
    // An opaque tile is a mark with its own field. Fitted to the circle's
    // inscribed square and rounded, it reads as a tile placed on the chip.
    // Scaled to the circle's width instead, the circle would cut its corners.
    const side = Math.round(SIZE / Math.SQRT2)
    const corner = Math.round(side * 0.18)
    const tile = await image.resize(side, side, { kernel: "lanczos3" }).png().toBuffer()
    const rounded = await sharp(tile)
      .composite([
        {
          input: Buffer.from(
            `<svg width="${side}" height="${side}"><rect width="${side}" height="${side}" rx="${corner}" ry="${corner}"/></svg>`
          ),
          blend: "dest-in"
        }
      ])
      .png()
      .toBuffer()
    return {
      readable: true,
      buffer: await sharp({
        create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      })
        .composite([{ input: rounded, gravity: "centre" }])
        .png({ compressionLevel: 9 })
        .toBuffer()
    }
  }

  const { info } = await image.trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true })
  const ratio = info.width / info.height
  if (ratio > READABLE_RATIO) return { readable: false }

  const scale = inscribe(info.width, info.height)
  const mark = await sharp(join(logos, file))
    .trim({ threshold: 0 })
    .resize(Math.max(1, Math.round(info.width * scale)), Math.max(1, Math.round(info.height * scale)), {
      kernel: "lanczos3"
    })
    .png()
    .toBuffer()

  return {
    readable: true,
    buffer: await sharp({
      create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: mark, gravity: "centre" }])
      .png({ compressionLevel: 9 })
      .toBuffer()
  }
}

const registry = JSON.parse(readFileSync(registryPath, "utf8"))
const unreadable = new Set()
const readable = new Set()
let fitted = 0

for (const file of readdirSync(logos).filter(name => name.endsWith(".png"))) {
  const result = await fit(file)
  if (!result.readable) {
    unreadable.add(`/tokens/${file}`)
    continue
  }
  readable.add(`/tokens/${file}`)
  writeFileSync(join(logos, file), result.buffer)
  fitted += 1
}

// A logo the circle cannot carry is marked rather than deleted. The mark in the
// interface falls back to the ticker, and a wallet, which draws the token in a
// layout of its own, still gets an image instead of nothing.
let dropped = 0
for (const token of registry.tokens) {
  const own = `/tokens/${token.symbol.toLowerCase()}.png`
  if (unreadable.has(own)) {
    token.icon = own
    token.wideMark = true
    dropped += 1
  } else if (readable.has(own)) {
    token.icon = own
    delete token.wideMark
  }
}
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)

console.log(`fit-token-logos: ${fitted} fitted, ${dropped} too wide for a circle, shown as tickers there and as logos in a wallet`)
