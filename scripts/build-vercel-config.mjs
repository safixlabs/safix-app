// Writes vercel.json from site.config.json.
//
// The deployment configuration is not something to keep in step with the domain
// by hand. Once site.config.json names the apex domain, this emits the permanent
// redirect that moves the generated hostname to the real one, so the old links
// people already have keep working.
//
//   npm run build:config

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"))

const domain = process.env.NEXT_PUBLIC_SAFIX_DOMAIN ?? config.domain
const here = config.surfaces.app

const redirects = []
if (domain && here.currentUrl) {
  const oldHost = here.currentUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
  const newHost = `${here.subdomain ? `${here.subdomain}.` : ""}${domain}`
  if (oldHost !== newHost) {
    // Host-conditioned so the rule only fires on the generated hostname and
    // never loops on the real one.
    redirects.push({
      source: "/:path*",
      has: [{ type: "host", value: oldHost }],
      destination: `https://${newHost}/:path*`,
      permanent: true
    })
  }
}

const vercel = {
  $schema: "https://openapi.vercel.sh/vercel.json",
  ...(redirects.length > 0 ? { redirects } : {}),
  headers: [
    {
      // The social preview images and the touch icons are content addressed by
      // the build, so they can be cached hard.
      source: "/(og|icons)/(.*)",
      headers: [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400" }]
    }
  ]
}

writeFileSync(join(root, "vercel.json"), `${JSON.stringify(vercel, null, 2)}\n`)
console.log(
  domain
    ? `build-vercel-config: domain ${domain}, ${redirects.length} redirect(s)`
    : "build-vercel-config: no domain set yet, no redirects emitted"
)
