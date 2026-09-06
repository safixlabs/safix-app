import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { DM_Sans } from "next/font/google"
import "./globals.css"
import Backdrop from "@/components/Backdrop"
import RpcNotice from "@/components/RpcNotice"
import Telemetry from "@/components/Telemetry"
import TopNav from "@/components/TopNav"
import Providers from "./providers"

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans-src"
})

export const metadata: Metadata = {
  title: {
    default: "Safix app",
    template: "%s · Safix app"
  },
  description:
    "Borrow USDG against tokenized assets at zero interest, provide liquidity to the stability pool, and manage your private credit passport."
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
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-[3px] focus-visible:bg-mint focus-visible:px-4 focus-visible:py-2 focus-visible:text-[13px] focus-visible:font-semibold focus-visible:text-ink"
        >
          Skip to content
        </a>
        <Backdrop />
        <Providers>
          <Telemetry />
          <TopNav />
          <RpcNotice />
          <main id="main" className="mx-auto w-full max-w-[1120px] px-6 pb-24 pt-10 md:pt-14">
            {children}
          </main>
        </Providers>
        <footer className="mx-auto flex w-full max-w-[1120px] flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-line px-6 pb-8 pt-6 text-[12px] tracking-[-0.02em] text-haze">
          <span>Safix</span>
          <nav aria-label="Legal and documentation" className="flex items-center gap-5">
            <Link href="/risk/" className="-m-1 inline-flex items-center p-1 transition-colors hover:text-mint">
              Risk
            </Link>
            <Link href="/terms/" className="-m-1 inline-flex items-center p-1 transition-colors hover:text-mint">
              Terms
            </Link>
            <a
              href="https://safix-docs.vercel.app"
              className="-m-1 inline-flex items-center gap-1 p-1 transition-colors hover:text-mint"
            >
              Documentation <span aria-hidden>→</span>
            </a>
          </nav>
        </footer>
      </body>
    </html>
  )
}
