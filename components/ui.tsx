"use client"

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import { useState } from "react"
import { assetIconSrc, assetInitials } from "@/lib/assets"
import { explorerTxUrl } from "@/lib/chain"
import { healthStateCopy, healthStateOf, liquidationHealth } from "@/lib/risk"

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
      Confirmed onchain <span aria-hidden>↗</span>
      <span className="sr-only">, opens in a new tab</span>
    </a>
  )
}

// The mark repeats a symbol that is almost always written beside it, so it stays
// decorative unless a caller says otherwise with `label`.
export function AssetMark({
  symbol,
  className = "h-8 w-8",
  label
}: {
  symbol: string
  className?: string
  label?: string
}) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={`flex shrink-0 items-center justify-center rounded-[3px] border border-line bg-carbon text-[10px] font-semibold tracking-[-0.01em] text-mist ${className}`}
      >
        {assetInitials(symbol)}
      </span>
    )
  }
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-carbon ${className}`}>
      <img
        src={assetIconSrc(symbol)}
        alt={label ?? ""}
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </span>
  )
}

export function Meter({ value, label, name }: { value: number; label?: string; name?: string }) {
  const width = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label={name ?? label}
        aria-valuenow={Math.round(width)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${width.toFixed(1)}%`}
        className="h-1.5 w-full overflow-hidden rounded-[2px] bg-line"
      >
        <div className="h-full bg-mint transition-[width] duration-500" style={{ width: `${width}%` }} />
      </div>
      {label ? <p className="text-[12px] tracking-[-0.02em] text-haze">{label}</p> : null}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-[3px] border border-control p-1">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`flex-1 rounded-[2px] px-4 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors ${
            value === option.value ? "bg-mint text-ink" : "text-mist hover:text-fog"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// `label` names what the fractions apply to, so three of these on one screen do not all
// announce as "Use 50 percent".
export function QuickAmounts({
  onPick,
  disabled,
  label
}: {
  onPick: (fraction: number) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div role="group" aria-label={`Quick amounts for ${label}`} className="flex gap-2">
      {[0.25, 0.5, 0.75, 1].map(fraction => (
        <button
          key={fraction}
          onClick={() => onPick(fraction)}
          disabled={disabled}
          aria-label={
            fraction === 1 ? `Use the maximum ${label}` : `Use ${fraction * 100} percent of ${label}`
          }
          className="flex-1 rounded-[3px] border border-control py-1.5 text-[12px] tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint disabled:cursor-not-allowed disabled:border-line disabled:text-haze"
        >
          {fraction === 1 ? "Max" : `${fraction * 100}%`}
        </button>
      ))}
    </div>
  )
}

export function SummaryRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-[13.5px] tracking-[-0.01em]">
      <span className="text-haze">{label}</span>
      <span className="text-right text-mist">{value}</span>
    </div>
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] text-fog sm:text-[30px] md:text-[36px]">
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
      <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.01em] text-fog md:text-[27px]">
        {value}
      </p>
      {hint ? <p className="mt-2.5 text-[12px] leading-snug tracking-[-0.02em] text-haze">{hint}</p> : null}
    </div>
  )
}

export function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[4px] border border-line bg-panel/80 p-5 sm:p-6 md:p-7">
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
      className={`rounded-[3px] bg-mint px-6 py-3 text-[14px] font-semibold tracking-[-0.01em] text-ink transition-colors hover:bg-mint-bright disabled:cursor-not-allowed disabled:bg-line disabled:text-haze ${className ?? ""}`}
    />
  )
}

// Disabled states never dim with opacity: a disabled button often carries the sentence
// explaining why it is disabled, so its label has to stay readable.
export function GhostButton({
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "md" }) {
  const sizing = size === "sm" ? "px-5 py-2 text-[12.5px]" : "px-5 py-2.5 text-[13px]"
  return (
    <button
      {...rest}
      className={`rounded-[3px] border border-control ${sizing} font-medium tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint disabled:cursor-not-allowed disabled:border-line disabled:text-haze disabled:hover:border-line disabled:hover:text-haze ${className ?? ""}`}
    />
  )
}

export function Field(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return (
    <input
      {...rest}
      aria-label={rest["aria-label"] ?? rest.placeholder}
      className={`w-full rounded-[3px] border border-control bg-carbon/60 px-4 py-3.5 text-[15px] tracking-[-0.01em] text-fog transition-colors placeholder:text-haze focus:border-mint ${className ?? ""}`}
    />
  )
}

export function HealthBadge({
  health,
  liqThresholdBps,
  hasDebt
}: {
  health: number
  liqThresholdBps: number
  hasDebt: boolean
}) {
  const state = healthStateOf(health, liqThresholdBps, hasDebt)
  const copy = healthStateCopy[state]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border border-line px-2.5 py-1 text-[12px] tracking-[-0.01em] ${copy.tone}`}
      title={copy.blurb}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {copy.label}
      {/* The tooltip is mouse-only, so the same sentence is read out too. */}
      <span className="sr-only">. {copy.blurb}</span>
    </span>
  )
}

export function HealthBar({
  ratio,
  liqThresholdBps = 9000,
  hasDebt = true,
  label = "Position health"
}: {
  ratio: number
  liqThresholdBps?: number
  hasDebt?: boolean
  label?: string
}) {
  const floor = liquidationHealth(liqThresholdBps) || 1
  const width = Math.max(4, Math.min(100, (ratio / (floor * 2)) * 100))
  const state = healthStateOf(ratio, liqThresholdBps, hasDebt)
  const fill = state === "liquidatable" ? "bg-danger" : state === "atRisk" ? "bg-amber" : "bg-mint"
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.min(Math.round(ratio * 100), Math.round(floor * 200))}
        aria-valuemin={0}
        aria-valuemax={Math.round(floor * 200)}
        aria-valuetext={`${(ratio * 100).toFixed(0)} percent, ${healthStateCopy[state].label}`}
        className="relative h-1.5 w-full max-w-[140px] overflow-hidden rounded-none bg-line"
      >
        <div className={`h-full rounded-none ${fill}`} style={{ width: `${width}%` }} />
        {/* The midpoint of the track is the liquidation level. */}
        <span className="absolute inset-y-0 w-px bg-haze" style={{ left: "50%" }} />
      </div>
      <span className="text-[13px] tracking-[-0.01em] text-mist">{(ratio * 100).toFixed(0)}%</span>
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
