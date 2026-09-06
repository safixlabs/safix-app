"use client"

import { useEffect, useState } from "react"
import type { Connector } from "wagmi"
import { useConnect } from "wagmi"
import { track } from "@/lib/analytics"
import { humanError } from "@/lib/errors"
import { walletConnectReady } from "@/lib/wagmi"
import { hasBrowserWallet, walletOptions, type WalletOption } from "@/lib/wallets"
import Portal from "./Portal"

function WalletIcon({ option }: { option: WalletOption }) {
  if (option.icon) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-carbon">
        <img src={option.icon} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }

  if (option.kind === "coinbase") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-[#0052ff]">
        <svg viewBox="0 0 32 32" aria-hidden className="h-5 w-5">
          <circle cx="16" cy="16" r="16" fill="#0052ff" />
          <path d="M16 4.6a11.4 11.4 0 1 0 0 22.8 11.4 11.4 0 0 0 0-22.8zm-2.7 8.1c0-.5.4-.9.9-.9h3.6c.5 0 .9.4.9.9v6.6c0 .5-.4.9-.9.9h-3.6a.9.9 0 0 1-.9-.9v-6.6z" fill="#fff" />
        </svg>
      </span>
    )
  }

  if (option.kind === "walletconnect") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-line bg-carbon text-mint">
        <svg viewBox="0 0 32 32" aria-hidden className="h-5 w-5">
          <path
            d="M9.3 12.4c3.7-3.6 9.7-3.6 13.4 0l.5.4c.2.2.2.5 0 .7l-1.6 1.5c-.1.1-.2.1-.3 0l-.6-.6c-2.6-2.5-6.8-2.5-9.4 0l-.7.7c-.1.1-.2.1-.3 0L8.7 13.5c-.2-.2-.2-.5 0-.7zm16.5 3.1 1.5 1.4c.2.2.2.5 0 .7l-6.6 6.4c-.2.2-.5.2-.7 0l-4.7-4.6c0-.1-.1-.1-.2 0l-4.7 4.6c-.2.2-.5.2-.7 0L2.7 17.6c-.2-.2-.2-.5 0-.7l1.5-1.4c.2-.2.5-.2.7 0l4.7 4.6c.1.1.2.1.2 0l4.7-4.6c.2-.2.5-.2.7 0l4.7 4.6c.1.1.2.1.2 0l4.7-4.6c.2-.2.5-.2.7 0z"
            fill="currentColor"
          />
        </svg>
      </span>
    )
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-line bg-carbon text-[11px] font-semibold text-mist">
      {option.name.slice(0, 2).toUpperCase()}
    </span>
  )
}

/** Nothing at all to connect with: no browser wallet, no WalletConnect, no Coinbase. */
function NoWalletState() {
  return (
    <div className="rounded-[3px] border border-line bg-carbon/40 p-5">
      <p className="text-[14px] font-semibold tracking-[-0.01em] text-fog">No wallet available</p>
      <p className="mt-2 text-[13.5px] leading-[1.6] tracking-[-0.01em] text-mist">
        This browser has no wallet installed, and no remote wallet option is configured on this
        deployment, so there is nothing to connect to.
      </p>
      <p className="mt-3 text-[13px] leading-[1.6] tracking-[-0.01em] text-haze">
        On a desktop browser, install a wallet extension such as MetaMask, Rabby or Coinbase Wallet
        and reload this page. On a phone, open this page inside your wallet app&apos;s own browser.
      </p>
      {!walletConnectReady ? (
        <p className="mt-3 text-[12.5px] leading-[1.6] tracking-[-0.02em] text-haze">
          Operators: set <code className="text-mist">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code> to
          offer WalletConnect here, which needs no extension.
        </p>
      ) : null}
    </div>
  )
}

/** A wallet can still be reached, but not from this browser directly. */
function NoBrowserWalletNotice() {
  return (
    <div className="mb-4 rounded-[3px] border border-line bg-carbon/40 p-4">
      <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-fog">
        No wallet extension in this browser
      </p>
      <p className="mt-1.5 text-[12.5px] leading-[1.6] tracking-[-0.01em] text-mist">
        {walletConnectReady
          ? "Use one of the options below to connect a wallet on your phone, or install an extension such as MetaMask, Rabby or Coinbase Wallet and reload."
          : "Use Coinbase Wallet below, or install an extension such as MetaMask, Rabby or Coinbase Wallet and reload."}
      </p>
    </div>
  )
}

export default function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connect, connectors, isPending, error, reset, variables } = useConnect()
  const [options, setOptions] = useState<WalletOption[] | null>(null)

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  // wagmi registers the plain `injected` connector whether or not this browser
  // actually has an injected provider, so offering it unconditionally would
  // hand a phone browser a button that can only fail. Ask each one for its
  // provider before listing it.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all(
      walletOptions(connectors).map(async option => {
        if (option.kind !== "generic") return option
        const provider = await option.connector.getProvider().catch(() => undefined)
        return provider ? option : null
      })
    ).then(resolved => {
      if (!cancelled) setOptions(resolved.filter((option): option is WalletOption => option !== null))
    })
    return () => {
      cancelled = true
    }
  }, [open, connectors])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const pendingId = isPending ? (variables?.connector as Connector | undefined)?.id : undefined

  const pick = (connector: Connector) => {
    connect(
      { connector },
      {
        onSuccess: () => {
          track("connect_succeeded")
          onClose()
        },
        onError: () => track("connect_failed")
      }
    )
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-carbon/80 p-5 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-dialog-title"
          onClick={event => event.stopPropagation()}
          className="max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-[3px] border border-line bg-panel p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="wallet-dialog-title" className="text-[19px] font-bold tracking-[-0.01em] text-fog">
                Connect a wallet
              </h2>
              <p className="mt-1.5 text-[13px] leading-[1.55] tracking-[-0.01em] text-haze">
                Safix never takes custody. You sign every action yourself.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 text-haze transition-colors hover:text-fog"
            >
              <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-5">
            {options === null ? (
              <p className="py-2 text-[13.5px] tracking-[-0.01em] text-haze">Looking for wallets…</p>
            ) : options.length === 0 ? (
              <NoWalletState />
            ) : (
              <>
                {hasBrowserWallet(options) ? null : <NoBrowserWalletNotice />}
                <ul className="flex flex-col gap-2">
                  {options.map(option => (
                    <li key={option.id}>
                      <button
                        onClick={() => pick(option.connector)}
                        disabled={isPending}
                        className="flex w-full items-center gap-3.5 rounded-[3px] border border-line bg-carbon/30 px-4 py-3.5 text-left transition-colors hover:border-mint disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <WalletIcon option={option} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-fog">
                            {option.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] tracking-[-0.02em] text-haze">
                            {option.detail}
                          </span>
                        </span>
                        {pendingId === option.id ? (
                          <span className="shrink-0 text-[12px] tracking-[-0.01em] text-mint">Waiting…</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-[13px] leading-[1.55] tracking-[-0.01em] text-amber">
              {humanError(error)}
            </p>
          ) : null}
        </div>
      </div>
    </Portal>
  )
}
