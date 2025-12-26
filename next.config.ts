import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure Turbopack resolves modules from this project directory
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
