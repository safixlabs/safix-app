export const appLinks = [
  { href: "/", title: "Dashboard" },
  { href: "/borrow/", title: "Borrow" },
  { href: "/pool/", title: "Pool" },
  { href: "/partnerships/", title: "Partnerships" },
  { href: "/passport/", title: "Passport" }
]

export const normalizePath = (path: string) => path.replace(/\/+$/, "") || "/"
