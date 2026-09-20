import type { MetadataRoute } from "next"
import { self } from "@/lib/site"

export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  const surface = self()
  return {
    name: surface.name,
    short_name: "Safix",
    description: surface.description,
    start_url: "/",
    display: "standalone",
    background_color: "#070c0c",
    theme_color: "#070c0c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png" }
    ]
  }
}
