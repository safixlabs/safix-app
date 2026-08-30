"use client"

import { useEffect, useState } from "react"
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import { Field, PageHeader, Panel, PrimaryButton, Stat } from "@/components/ui"
import { poolStats, usd } from "@/lib/demo"
import {
  erc20Abi,
  fromTokenUnits,
  fromUsdcUnits,
  isLive,
  liveAssets,
  poolAddress,
  safixPoolAbi,
  usdcAddress,
  usdcUnits
} from "@/lib/safix"

function LivePool() {
  const { address } = useAccount()
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit")
  const [amount, setAmount] = useState("")

  const totalDeposits = useReadContract({
    abi: safixPoolAbi,
    address: poolAddress,
    functionName: "totalDeposits"
  })
  const compounded = useReadContract({
    abi: safixPoolAbi,
    address: poolAddress,
    functionName: "compoundedDepositOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  })
  const allowance = useReadContract({
    abi: erc20Abi,
    address: usdcAddress,
    functionName: "allowance",
    args: address && poolAddress ? [address, poolAddress] : undefined,
    query: { enabled: Boolean(address) }
  })
  const usdcBalance = useReadContract({
    abi: erc20Abi,
    address: usdcAddress,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  })
  const firstGain = useReadContract({
    abi: safixPoolAbi,
    address: poolAddress,
    functionName: "gainOf",
    args: address && liveAssets[0] ? [address, liveAssets[0].address] : undefined,
    query: { enabled: Boolean(address && liveAssets[0]) }
  })

  const { writeContract, data: txHash, isPending, error } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (receipt.isSuccess) {
      totalDeposits.refetch()
      compounded.refetch()
      allowance.refetch()
      usdcBalance.refetch()
      firstGain.refetch()
    }
  }, [receipt.isSuccess])

  const parsed = Number.parseFloat(amount)
  const units = Number.isFinite(parsed) && parsed > 0 ? usdcUnits(parsed) : 0n
  const needsApproval = mode === "deposit" && units > 0n && (allowance.data ?? 0n) < units
  const busy = isPending || (Boolean(txHash) && receipt.isLoading)

  const submit = () => {
    if (!poolAddress || !usdcAddress || units === 0n) return
    if (mode === "deposit") {
      if (needsApproval) {
        writeContract({ abi: erc20Abi, address: usdcAddress, functionName: "approve", args: [poolAddress, units] })
      } else {
        writeContract({ abi: safixPoolAbi, address: poolAddress, functionName: "deposit", args: [units] })
      }
    } else {
      writeContract({ abi: safixPoolAbi, address: poolAddress, functionName: "withdraw", args: [units] })
    }
  }

  const claim = () => {
    if (!poolAddress || liveAssets.length === 0) return
    writeContract({
      abi: safixPoolAbi,
      address: poolAddress,
      functionName: "claimGains",
      args: [liveAssets.map(asset => asset.address)]
    })
  }

  const mintTestUsdc = () => {
    if (!usdcAddress || !address) return
    writeContract({ abi: erc20Abi, address: usdcAddress, functionName: "mint", args: [address, 10_000n * 10n ** 6n] })
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Pool size"
          value={totalDeposits.data !== undefined ? usd(fromUsdcUnits(totalDeposits.data), 0) : "…"}
          hint="USDC deposited by providers"
        />
        <Stat
          label="Your deposit"
          value={address && compounded.data !== undefined ? usd(fromUsdcUnits(compounded.data)) : "–"}
          hint={address ? "Compounded after liquidations" : "Connect a wallet"}
        />
        <Stat
          label={`Claimable ${liveAssets[0]?.symbol ?? "gains"}`}
          value={address && firstGain.data !== undefined ? fromTokenUnits(firstGain.data).toFixed(4) : "–"}
          hint="Collateral received from liquidations"
        />
        <Stat
          label="Your USDC"
          value={address && usdcBalance.data !== undefined ? usd(fromUsdcUnits(usdcBalance.data)) : "–"}
          hint="Wallet balance"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Panel title={mode === "deposit" ? "Deposit USDC" : "Withdraw USDC"}>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              {(["deposit", "withdraw"] as const).map(candidate => (
                <button
                  key={candidate}
                  onClick={() => setMode(candidate)}
                  className={`rounded-full px-4 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors ${
                    mode === candidate
                      ? "bg-mint text-carbon"
                      : "border border-line text-mist hover:text-fog"
                  }`}
                >
                  {candidate === "deposit" ? "Deposit" : "Withdraw"}
                </button>
              ))}
            </div>
            <Field
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={event => setAmount(event.target.value)}
            />
            <PrimaryButton disabled={units === 0n || busy || !address} onClick={submit} className="w-full">
              {busy
                ? "Confirming…"
                : mode === "withdraw"
                  ? "Withdraw"
                  : needsApproval
                    ? "Approve USDC"
                    : "Deposit"}
            </PrimaryButton>
            <button
              onClick={claim}
              disabled={busy || !address}
              className="rounded-full border border-line px-5 py-2.5 text-[13px] font-medium tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
            >
              Claim liquidation gains
            </button>
            <button
              onClick={mintTestUsdc}
              disabled={busy || !address}
              className="rounded-full border border-line px-5 py-2 text-[12.5px] font-medium tracking-[-0.01em] text-haze transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
            >
              Mint 10,000 test USDC
            </button>
            <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
              {error
                ? error.message.split("\n")[0]
                : receipt.isSuccess
                  ? "Confirmed onchain."
                  : "Withdraw any time outside active liquidations."}
            </p>
          </div>
        </Panel>

        <Panel title="How the pool earns">
          <ul className="flex flex-col divide-y divide-line text-[14px] leading-[1.6] tracking-[-0.01em] text-mist">
            <li className="py-3">
              When a position falls below the required collateral level, the pool absorbs its debt and
              receives the collateral at a discount.
            </li>
            <li className="py-3">
              Liquidation gains accrue per asset and can be claimed at any time. Protocol rewards come
              on top once live.
            </li>
            <li className="py-3">
              There is no rate and no yield from time. A quiet market is a quiet pool, and that is by
              design.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  )
}

function DemoPool() {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit")
  const [amount, setAmount] = useState("")
  const [submitted, setSubmitted] = useState(false)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pool size" value={usd(poolStats.tvl, 0)} hint="USDC deposited by providers" />
        <Stat label="Your deposit" value={usd(poolStats.yourDeposit, 0)} hint={`${(poolStats.poolShare * 100).toFixed(2)}% of the pool`} />
        <Stat label="Liquidation gains" value={usd(poolStats.liquidationGains)} hint="Discounted collateral received" />
        <Stat label="Protocol rewards" value={usd(poolStats.rewards)} hint="Lifetime, claimable" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Panel title={mode === "deposit" ? "Deposit USDC" : "Withdraw USDC"}>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              {(["deposit", "withdraw"] as const).map(candidate => (
                <button
                  key={candidate}
                  onClick={() => {
                    setMode(candidate)
                    setSubmitted(false)
                  }}
                  className={`rounded-full px-4 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors ${
                    mode === candidate
                      ? "bg-mint text-carbon"
                      : "border border-line text-mist hover:text-fog"
                  }`}
                >
                  {candidate === "deposit" ? "Deposit" : "Withdraw"}
                </button>
              ))}
            </div>
            <Field
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={event => {
                setAmount(event.target.value)
                setSubmitted(false)
              }}
            />
            <PrimaryButton
              disabled={!(Number.parseFloat(amount) > 0)}
              onClick={() => setSubmitted(true)}
              className="w-full"
            >
              {mode === "deposit" ? "Deposit" : "Withdraw"}
            </PrimaryButton>
            <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
              {submitted
                ? "Demo action recorded. Set the contract addresses to go live."
                : "Demo mode: no pool contract configured yet."}
            </p>
          </div>
        </Panel>

        <Panel title="How the pool earns">
          <ul className="flex flex-col divide-y divide-line text-[14px] leading-[1.6] tracking-[-0.01em] text-mist">
            <li className="py-3">
              When a position falls below the required collateral level, the pool repays its debt and
              receives the collateral at a discount.
            </li>
            <li className="py-3">
              Protocol rewards are distributed to providers on top of liquidation gains.
            </li>
            <li className="py-3">
              There is no rate and no yield from time. A quiet market is a quiet pool, and that is by
              design.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  )
}

export default function PoolPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Stability pool"
        lead="The pool funds every draw and absorbs every liquidation. Providers earn from real events, liquidation gains and protocol rewards, never from time."
        badge={isLive ? "Live onchain" : "Demo data"}
      />
      {isLive ? <LivePool /> : <DemoPool />}
    </div>
  )
}
