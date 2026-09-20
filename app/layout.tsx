import type { Metadata, Viewport } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { Red_Hat_Display } from "next/font/google"
import "./globals.css"
import Backdrop from "@/components/Backdrop"
import RpcNotice from "@/components/RpcNotice"
import Telemetry from "@/components/Telemetry"
import TopNav from "@/components/TopNav"
import Providers from "./providers"
import { legalLinks } from "@/components/nav"
import { absolute, allSurfaces, baseUrl, self } from "@/lib/site"

const sans = Red_Hat_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-src"
})

const surface = self()

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl()),
  title: {
    default: surface.name,
    template: `%s · ${surface.name}`
  },
  description: surface.description,
  applicationName: surface.name,
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: surface.name,
    url: absolute("/"),
    title: surface.name,
    description: surface.description,
    locale: "en_US",
    images: [{ url: "/og/index.png", width: 1200, height: 630, alt: surface.name }]
  },
  twitter: {
    card: "summary_large_image",
    title: surface.name,
    description: surface.description,
    images: ["/og/index.png"]
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070c0c" },
    { media: "(prefers-color-scheme: light)", color: "#f4f8f7" }
  ]
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("safix.theme");var t=s==="dark"||s==="light"?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t}catch(e){}})()`
          }}
        />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-[var(--corner-control)] focus-visible:bg-mint focus-visible:px-4 focus-visible:py-2 focus-visible:text-[13px] focus-visible:font-semibold focus-visible:text-ink"
        >
          Skip to content
        </a>
        <Backdrop />
        <Providers>
          <Telemetry />
          <TopNav />
          <RpcNotice />
          <main id="main" className="mx-auto w-full max-w-[1120px] px-5 pb-24 pt-10 sm:px-6 md:pt-14">
            {children}
          </main>
        </Providers>
        <footer className="mx-auto flex w-full max-w-[1120px] flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-line px-6 pb-8 pt-6 text-[12px] tracking-[-0.02em] text-haze">
          <span>Safix</span>
          <nav aria-label="Legal and other Safix sites" className="flex flex-wrap items-center gap-5">
            {legalLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="-m-1 inline-flex items-center p-1 transition-colors hover:text-mint"
              >
                {link.title}
              </Link>
            ))}
            {allSurfaces()
              .filter(other => other.key !== surface.key && other.url !== null)
              .map(other => (
                <a
                  key={other.key}
                  href={other.url as string}
                  className="-m-1 inline-flex items-center gap-1 p-1 transition-colors hover:text-mint"
                >
                  {other.key === "marketing" ? "Safix" : other.role} <span aria-hidden>→</span>
                </a>
              ))}
          </nav>
        </footer>
      </body>
    </html>
  )
}
