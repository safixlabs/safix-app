"use client"

import * as Sentry from "@sentry/react"
import { activeChain } from "./chain"
import { redactDeep, redactUrl } from "./redact"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()

/** Errors are only reported where a dashboard is configured to receive them. */
export const monitoringReady = Boolean(dsn)

let started = false

/**
 * Reports failures without reporting who hit them.
 *
 * Everything Sentry can gather about a person is switched off at the source —
 * no user info, no cookies, no headers, no bodies, no query strings — and then
 * every event is walked and redacted on the way out anyway. Two layers, because
 * the first depends on knowing every field the SDK might fill and the second
 * does not.
 *
 * What is deliberately kept: the stack trace, the release, and the chain the
 * app is pointed at, which is the one piece of context that makes a revert
 * intelligible.
 */
export function startMonitoring() {
  if (started || !dsn || typeof window === "undefined") return
  started = true

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? "production",
    release: process.env.NEXT_PUBLIC_RELEASE,
    // Nothing that identifies a person is collected in the first place.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      queryParams: false,
      urlQueryParams: false
    },
    // Sampled at nothing: this is error monitoring, not a tracing surface.
    tracesSampleRate: 0,
    integrations: integrations =>
      // Breadcrumbs from fetch and history carry RPC URLs and the paths the
      // person walked; the redaction below cleans them, but the console
      // integration is dropped outright because what reaches it is unbounded.
      integrations.filter(integration => integration.name !== "Console"),
    beforeSend(event) {
      const cleaned = redactDeep(event)
      // Belt and braces: these are the fields that exist to hold identity.
      delete cleaned.user
      delete cleaned.server_name
      if (cleaned.request) {
        delete cleaned.request.cookies
        delete cleaned.request.headers
        delete cleaned.request.data
        delete cleaned.request.query_string
        if (cleaned.request.url) cleaned.request.url = redactUrl(cleaned.request.url)
      }
      cleaned.tags = { ...cleaned.tags, chain_id: String(activeChain.id), chain: activeChain.name }
      return cleaned
    },
    beforeBreadcrumb(breadcrumb) {
      const cleaned = redactDeep(breadcrumb)
      if (typeof cleaned.data?.url === "string") cleaned.data.url = redactUrl(cleaned.data.url)
      return cleaned
    }
  })
}

/**
 * Reports something the app caught itself.
 *
 * The context goes through the same redaction as everything else, so a caller
 * cannot leak an address by passing it in.
 */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!monitoringReady) return
  Sentry.captureException(error, context ? { extra: redactDeep(context) } : undefined)
}
