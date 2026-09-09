// Per-page metadata, derived rather than repeated. A page states its own
// description; its title comes from the navigation, its canonical URL from the
// surface configuration, and its social preview from the image build-og.mjs
// rendered for that same route.

import type { Metadata } from "next"
import { allPages, normalizePath } from "@/components/nav"
import { absolute, self } from "./site"

/** public/og file name for a route, matching slugOf in scripts/build-og.mjs. */
export const ogSlug = (href: string): string => {
  const trimmed = href.replace(/^\/+|\/+$/g, "")
  return trimmed === "" ? "index" : trimmed.replace(/\//g, "-")
}

export function pageMetadata(href: string, description: string): Metadata {
  const page = allPages.find(candidate => normalizePath(candidate.href) === normalizePath(href))
  if (!page) throw new Error(`${href} is not in components/nav.ts, so it has no title to publish`)

  const surface = self()
  const image = `/og/${ogSlug(href)}.png`
  const isRoot = normalizePath(href) === "/"
  const title = isRoot ? surface.name : `${page.title} · ${surface.name}`

  return {
    title: isRoot ? undefined : page.title,
    description,
    alternates: { canonical: href },
    openGraph: {
      type: "website",
      siteName: surface.name,
      url: absolute(href),
      title,
      description,
      locale: "en_US",
      images: [{ url: image, width: 1200, height: 630, alt: `${page.title} · ${surface.name}` }]
    },
    twitter: { card: "summary_large_image", title, description, images: [image] }
  }
}
