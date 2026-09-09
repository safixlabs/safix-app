// Verifies the surface configuration and the generated assets agree with the
// site, so a page cannot ship with a preview image that was never rendered or a
// surface that points nowhere.
//
//   npm run check:site

import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const problems = []
const notes = []

const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"))
const domain = process.env.NEXT_PUBLIC_SAFIX_DOMAIN ?? config.domain

for (const [key, surface] of Object.entries(config.surfaces)) {
  for (const field of ["name", "role", "description"]) {
    if (!surface[field]) problems.push(`surface ${key} has no ${field}`)
  }
  if (!("subdomain" in surface)) problems.push(`surface ${key} does not say where it sits on the domain`)
  if (!domain && !surface.currentUrl) {
    notes.push(`surface ${key} has no address yet: no domain is set and it has no currentUrl`)
  }
  if (surface.currentUrl && !/^https:\/\//.test(surface.currentUrl)) {
    problems.push(`surface ${key} currentUrl is not https`)
  }
}

if (!config.surfaces.app?.currentUrl && !domain) {
  problems.push("the app surface has no address at all; the build cannot resolve a canonical url")
}

// Every page in the navigation needs the preview image build-og.mjs renders for
// it, under the exact name lib/metadata.ts will ask for.
const nav = readFileSync(join(root, "components", "nav.ts"), "utf8")
if (!/export const allPages/.test(nav)) {
  problems.push("components/nav.ts no longer exports allPages, so nothing knows which pages exist")
} else {
  const pages = [...new Set([...nav.matchAll(/href:\s*"([^"]+)"/g)].map(match => match[1]))]
  if (pages.length === 0) problems.push("components/nav.ts lists no pages")
  for (const href of pages) {
    const trimmed = href.replace(/^\/+|\/+$/g, "")
    const slug = trimmed === "" ? "index" : trimmed.replace(/\//g, "-")
    const image = join(root, "public", "og", `${slug}.png`)
    if (!existsSync(image)) {
      problems.push(`${href} has no social preview image; run npm run build:og`)
      continue
    }
    const header = readFileSync(image).subarray(1, 4).toString()
    if (header !== "PNG") problems.push(`public/og/${slug}.png is not a PNG`)
  }
}

for (const icon of ["app/icon.png", "app/apple-icon.png", "public/icons/icon-192.png", "public/icons/icon-256.png"]) {
  if (!existsSync(join(root, icon))) problems.push(`missing ${icon}; run npm run build:icons`)
}

for (const font of ["assets/fonts/DMSans-Regular.ttf", "assets/fonts/DMSans-Bold.ttf"]) {
  if (!existsSync(join(root, font))) problems.push(`missing ${font}; the preview images cannot be rendered`)
}

// The committed deployment config has to match what the current domain implies.
const vercelPath = join(root, "vercel.json")
if (!existsSync(vercelPath)) {
  problems.push("missing vercel.json; run npm run build:config")
} else {
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8"))
  const redirects = vercel.redirects ?? []
  if (domain && redirects.length === 0) {
    problems.push(`domain ${domain} is set but vercel.json redirects nothing; run npm run build:config`)
  }
  if (!domain && redirects.length > 0) {
    problems.push("vercel.json redirects to a domain that site.config.json does not name; run npm run build:config")
  }
}

if (problems.length > 0) {
  console.error(`check-site: ${problems.length} problem(s)`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(
  domain
    ? `check-site: ok, serving from ${domain}`
    : "check-site: ok, no domain registered yet, every surface on its generated hostname"
)
for (const note of notes) console.log(`  note: ${note}`)
