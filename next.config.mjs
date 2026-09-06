const nextConfig = {
  // Emitted so the stack traces Sentry receives can be mapped back to source.
  // scripts/sourcemaps.mjs uploads them and then deletes them from the output,
  // so they never reach the browser: this repository is private and the maps
  // would publish it.
  productionBrowserSourceMaps: true,
  agentRules: false,
  output: "export",
  trailingSlash: true
}

export default nextConfig
