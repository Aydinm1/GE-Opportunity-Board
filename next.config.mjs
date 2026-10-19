import { withSentryConfig } from "@sentry/nextjs";
import { readFileSync } from "node:fs";

const { HOST_ORIGIN } = JSON.parse(readFileSync(new URL('./config/host-origin.json', import.meta.url), 'utf8'));
const host = new URL(HOST_ORIGIN);
if (host.protocol !== 'https:' || host.origin !== HOST_ORIGIN) {
  throw new Error('HOST_ORIGIN must be an HTTPS origin without a path');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${host.origin}` },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
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
