import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep the native sharp module out of the server bundle so its binary loads
  // correctly at runtime (bundling native modules breaks them).
  serverExternalPackages: ['sharp', 'better-sqlite3'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
};

export default nextConfig;
