// One place that knows where the three Safix surfaces live.
//
// The structure is the one the launch calls for: marketing on the apex domain,
// the app and the documentation on subdomains of it. Registering the domain is
// therefore a single edit to site.config.json, or a single environment variable
// at build time, and every cross-link, canonical URL and social preview on this
// site follows from it without touching a page.

import config from "@/site.config.json"

export type SurfaceKey = "marketing" | "app" | "docs"

type SurfaceConfig = {
  name: string
  role: string
  subdomain: string | null
  currentUrl: string | null
  description: string
}

export type Surface = {
  key: SurfaceKey
  name: string
  role: string
  description: string
  /** Where the surface is reachable today, or null while it has no address. */
  url: string | null
  /** True once the surface is served from the project's own domain. */
  onDomain: boolean
}

const surfaces = config.surfaces as Record<SurfaceKey, SurfaceConfig>

// Written out one by one on purpose. Next inlines NEXT_PUBLIC_ variables into
// the client bundle by matching the literal expression, so a computed lookup
// would resolve on the server and come back undefined in the browser, and the
// two renders would disagree.
const overrides: Record<SurfaceKey, string | undefined> = {
  marketing: process.env.NEXT_PUBLIC_SAFIX_URL_MARKETING,
  app: process.env.NEXT_PUBLIC_SAFIX_URL_APP,
  docs: process.env.NEXT_PUBLIC_SAFIX_URL_DOCS
}

/** The apex domain, once registered. Environment wins so a preview build can point elsewhere. */
export const domain = (): string | null => {
  const fromEnv = process.env.NEXT_PUBLIC_SAFIX_DOMAIN?.trim()
  if (fromEnv) return fromEnv.replace(/^https?:\/\//, "").replace(/\/+$/, "")
  return config.domain
}

const urlFor = (key: SurfaceKey, entry: SurfaceConfig): string | null => {
  const override = overrides[key]?.trim()
  if (override) return override.replace(/\/+$/, "")
  const apex = domain()
  if (apex) return `https://${entry.subdomain ? `${entry.subdomain}.` : ""}${apex}`
  return entry.currentUrl
}

export const surface = (key: SurfaceKey): Surface => {
  const entry = surfaces[key]
  const url = urlFor(key, entry)
  return {
    key,
    name: entry.name,
    role: entry.role,
    description: entry.description,
    url,
    onDomain: Boolean(domain()) && url !== null
  }
}

export const allSurfaces = (): Surface[] =>
  (Object.keys(surfaces) as SurfaceKey[]).map(key => surface(key))

/** This surface. Everything on this site is served from it. */
export const self = (): Surface => surface("app")

/**
 * The absolute base every canonical URL and social preview is resolved against.
 * A surface always has one: without a domain it is the generated hostname.
 */
export const baseUrl = (): string => {
  const url = self().url
  if (!url) throw new Error("the app surface has no url; set domain or currentUrl in site.config.json")
  return url
}

export const absolute = (path: string): string => new URL(path, `${baseUrl()}/`).toString()
