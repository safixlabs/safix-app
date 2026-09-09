export const appLinks = [
  { href: "/", title: "Dashboard" },
  { href: "/borrow/", title: "Borrow" },
  { href: "/pool/", title: "Pool" },
  { href: "/partnerships/", title: "Partnerships" },
  { href: "/passport/", title: "Passport" }
]

/** Reachable outside the primary navigation, and linked from the footer. */
export const legalLinks = [
  { href: "/risk/", title: "Risk" },
  { href: "/terms/", title: "Terms" }
]

/** Every page this surface serves, for the sitemap and the social previews. */
export const allPages = [...appLinks, ...legalLinks]

export const normalizePath = (path: string) => path.replace(/\/+$/, "") || "/"
