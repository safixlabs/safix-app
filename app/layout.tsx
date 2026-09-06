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
        <Backdrop />
        <Providers>
          <Telemetry />
          <TopNav />
          <RpcNotice />
          <main className="mx-auto w-full max-w-[1120px] px-6 pb-24 pt-10 md:pt-14">{children}</main>
        </Providers>
        <footer className="mx-auto flex w-full max-w-[1120px] items-baseline justify-between border-t border-line px-6 pb-8 pt-6 text-[12px] tracking-[-0.02em] text-haze">
          <span>Safix</span>
          <nav className="flex items-center gap-5">
            <Link href="/risk/" className="transition-colors hover:text-mint">
              Risk
            </Link>
            <Link href="/terms/" className="transition-colors hover:text-mint">
              Terms
            </Link>
            <a href="https://safix-docs.vercel.app" className="transition-colors hover:text-mint">
              Documentation →
            </a>
          </nav>
        </footer>
      </body>
    </html>
  )
}
