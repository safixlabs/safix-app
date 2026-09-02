import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import { explorerTxUrl } from "@/lib/chain"

export function ConfirmedLink({ hash }: { hash?: `0x${string}` }) {
  const url = explorerTxUrl(hash)
  if (!url) return <>Confirmed onchain.</>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-mint transition-colors hover:text-mint-bright"
    >
      Confirmed onchain ↗
    </a>
  )
}

export function UsdgMark({ className = "h-4 w-4" }: { className?: string }) {
  return <img src="/usdg.png" alt="" className={`shrink-0 ${className}`} />
}

export function Usdg({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <UsdgMark className="h-[1.05em] w-[1.05em]" />
      USDG
    </span>
  )
}

export function UsdgTag() {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-[3px] border border-line bg-panel px-2 py-1 text-[11.5px] tracking-[-0.01em] text-mist">
      <UsdgMark className="h-3.5 w-3.5" />
      USDG
    </span>
  )
}

export function AmountField(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return (
    <span className="relative block w-full">
      <Field {...rest} className={`pr-[86px] ${className ?? ""}`} />
      <UsdgTag />
    </span>
  )
}

export function DemoTag({ label = "Demo data" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[3px] border border-line bg-panel/80 px-3.5 py-1.5 text-[12px] tracking-[-0.02em] text-haze">
      <span className="h-1.5 w-1.5 rounded-[3px] bg-mint" />
      {label}
    </span>
  )
}

export function PageHeader({ title, lead, badge }: { title: string; lead: string; badge?: string }) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-fog md:text-[36px]">
          {title}
        </h1>
        <DemoTag label={badge} />
      </div>
      <p className="max-w-[560px] text-[14px] leading-[1.6] tracking-[-0.02em] text-mist md:text-[15px]">
        {lead}
      </p>
    </header>
  )
}

export function Stat({ label, value, hint }: { label: ReactNode; value: string; hint?: string }) {
  return (
    <div className="rounded-[4px] border border-line bg-panel/80 p-5">
      <p className="flex items-center gap-1.5 text-[12.5px] tracking-[-0.02em] text-haze">{label}</p>
      <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.01em] text-fog [font-variant-numeric:tabular-nums] md:text-[27px]">
        {value}
      </p>
      {hint ? <p className="mt-2.5 text-[12px] leading-snug tracking-[-0.02em] text-haze">{hint}</p> : null}
    </div>
  )
}

export function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[4px] border border-line bg-panel/80 p-6 md:p-7">
      <h2 className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.01em] text-fog">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props
  return (
    <button
      {...rest}
      className={`rounded-[3px] bg-mint px-6 py-3 text-[14px] font-semibold tracking-[-0.01em] text-carbon transition-colors hover:bg-mint-bright disabled:cursor-not-allowed disabled:bg-line disabled:text-haze ${className ?? ""}`}
    />
  )
}

export function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props
  return (
    <button
      {...rest}
      className={`rounded-[3px] border border-line px-5 py-2.5 text-[13px] font-medium tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint ${className ?? ""}`}
    />
  )
}

export function Field(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return (
    <input
      {...rest}
      className={`w-full rounded-[3px] border border-line bg-carbon/60 px-4 py-3.5 text-[15px] tracking-[-0.01em] text-fog outline-none transition-colors [font-variant-numeric:tabular-nums] placeholder:text-haze focus:border-mint ${className ?? ""}`}
    />
  )
}

export function HealthBar({ ratio }: { ratio: number }) {
  const width = Math.max(4, Math.min(100, (ratio / 2.5) * 100))
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-full max-w-[140px] overflow-hidden rounded-none bg-line">
        <div className="h-full rounded-none bg-mint" style={{ width: `${width}%` }} />
      </div>
      <span className="text-[13px] tracking-[-0.01em] text-mist [font-variant-numeric:tabular-nums]">
        {(ratio * 100).toFixed(0)}%
      </span>
    </div>
  )
}

export function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
      <circle cx="8" cy="8" r="7" fill="none" stroke="#10e7c0" strokeWidth="1.4" />
      <path d="M4.8 8.3 7 10.4 11.2 5.9" fill="none" stroke="#10e7c0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
