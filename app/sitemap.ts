import type { MetadataRoute } from "next"
import { allPages } from "@/components/nav"
import { absolute } from "@/lib/site"

export const dynamic = "force-static"

// Every page this surface serves, taken from the navigation so the sitemap
// cannot fall behind the app.
export default function sitemap(): MetadataRoute.Sitemap {
  return allPages.map(page => ({
    url: absolute(page.href),
    changeFrequency: "weekly",
    priority: page.href === "/" ? 1 : 0.7
  }))
}
