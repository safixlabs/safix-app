const localIcons: Record<string, string> = {
  USDG: "/assets/usdg.png",
  tBILL: "/assets/tbill.png",
  bNVDA: "/assets/bnvda.png",
  tGOLD: "/assets/tgold.png"
}

const tickerOf = (symbol: string) => symbol.replace(/^[bt](?=[A-Z]{2,})/, "").toUpperCase()

export const assetIconSrc = (symbol: string) =>
  localIcons[symbol] ?? `https://assets.parqet.com/logos/symbol/${tickerOf(symbol)}?format=png&size=128`

export const assetInitials = (symbol: string) => symbol.replace(/^[bt](?=[A-Z]{2,})/, "").slice(0, 2).toUpperCase()
