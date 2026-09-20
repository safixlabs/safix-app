"use client"

import { useEffect, useState } from "react"

type Theme = "dark" | "light"

const STORAGE_KEY = "safix.theme"

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"

const readStored = (): Theme | null => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === "dark" || value === "light" ? value : null
  } catch {
    return null
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(readStored() ?? systemTheme())
  }, [])

  useEffect(() => {
    if (!theme) return
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {}
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)")
    const onChange = () => {
      if (!readStored()) setTheme(systemTheme())
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const next = theme === "light" ? "dark" : "light"

  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="terminal-hover-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--corner-control)] border border-control text-mist transition-colors hover:border-mint hover:text-mint"
    >
      {theme === "light" ? (
        <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
          <path
            fill="currentColor"
            d="M17.3 12.6a7.3 7.3 0 0 1-9.9-9.9 1 1 0 0 0-1.3-1.3 9.3 9.3 0 1 0 12.5 12.5 1 1 0 0 0-1.3-1.3Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
          <circle cx="10" cy="10" r="4" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M10 1.6v2M10 16.4v2M1.6 10h2M16.4 10h2M4.1 4.1l1.4 1.4M14.5 14.5l1.4 1.4M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4" />
          </g>
        </svg>
      )}
    </button>
  )
}
