#!/usr/bin/env node
// Sends the source maps to Sentry, then removes them from the build output.
//
// The upload has to happen in the build that produced the bundle being
// deployed, or the maps describe code nobody is running. So this runs as part
// of `npm run build` rather than in a separate job.
//
// The maps are then deleted. This repository is private, and a source map
// served next to a bundle publishes the source it was built from. Sentry keeps
// its copy; the browser never sees one.
import { spawnSync } from "node:child_process"
import { readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

const OUT = "out"
const log = message => process.stdout.write(`[sourcemaps] ${message}\n`)

const mapsUnder = directory => {
  const found = []
  const walk = path => {
    let entries
    try {
      entries = readdirSync(path)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(path, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith(".map")) found.push(full)
    }
  }
  walk(directory)
  return found
}

const maps = mapsUnder(OUT)
if (maps.length === 0) {
  log("no source maps in the build output, nothing to do")
  process.exit(0)
}

const token = process.env.SENTRY_AUTH_TOKEN
const org = process.env.SENTRY_ORG
const project = process.env.SENTRY_PROJECT
// The release ties the uploaded maps to the events the app reports. Both sides
// read the same commit, so they line up without anything being remembered.
const release =
  process.env.NEXT_PUBLIC_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA

if (token && org && project && release) {
  log(`uploading ${maps.length} maps for release ${release.slice(0, 12)}`)
  const run = args => {
    const result = spawnSync("npx", ["@sentry/cli", ...args], {
      stdio: "inherit",
      env: { ...process.env, SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org, SENTRY_PROJECT: project }
    })
    if (result.status !== 0) throw new Error(`sentry-cli ${args[0]} failed`)
  }
  try {
    run(["sourcemaps", "inject", OUT])
    run(["sourcemaps", "upload", "--release", release, OUT])
    log("uploaded")
  } catch (error) {
    // A build must not fail because a monitoring upload did. The maps are
    // deleted below either way, so nothing leaks when this path is taken.
    log(`upload failed, continuing: ${error.message}`)
  }
} else {
  const missing = [
    !token && "SENTRY_AUTH_TOKEN",
    !org && "SENTRY_ORG",
    !project && "SENTRY_PROJECT",
    !release && "NEXT_PUBLIC_RELEASE"
  ].filter(Boolean)
  log(`not uploading, ${missing.join(", ")} not set`)
}

for (const map of maps) rmSync(map, { force: true })
log(`removed ${maps.length} maps from ${OUT}, so none are served`)
