import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {};
const sentryTunnelRoute = process.env.NODE_ENV === "production" ? "/_board" : undefined;

export default withSentryConfig(nextConfig, {
  // Keep the browser tunnel in production, but avoid Next's local rewrite/proxy
  // deprecation warning on Node 22+ during development.
  tunnelRoute: sentryTunnelRoute,
  silent: true,
  telemetry: false,

  webpack: {
    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
