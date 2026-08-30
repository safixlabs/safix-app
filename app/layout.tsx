import type { Metadata } from "next"
import type { ReactNode } from "react"
import { DM_Sans } from "next/font/google"
import "./globals.css"
import Backdrop from "@/components/Backdrop"
import TopNav from "@/components/TopNav"

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
    "Borrow USDC against tokenized assets at zero interest, provide liquidity to the stability pool, and manage your private credit passport."
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <Backdrop />
        <TopNav />
        <main className="mx-auto w-full max-w-[1120px] px-6 pb-24 pt-10 md:pt-14">{children}</main>
        <footer className="mx-auto flex w-full max-w-[1120px] items-baseline justify-between border-t border-line px-6 pb-8 pt-6 text-[12px] tracking-[-0.02em] text-haze">
          <span>Safix</span>
          <a href="https://safix-docs.vercel.app" className="transition-colors hover:text-mint">
            Documentation →
          </a>
        </footer>
      </body>
    </html>
  )
}
