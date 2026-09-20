/** Brand only the network name, not surrounding warnings or SAFIX copy. */
export default function RobinhoodText({ children }: { children: string }) {
  return <>{children.split(/(Robinhood(?: Chain(?: Testnet)?)?)/g).map((part, index) =>
    index % 2 ? <span key={index} className="robinhood-text">{part}</span> : part
  )}</>
}
