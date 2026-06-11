import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep the native sharp module out of the server bundle so its binary loads
  // correctly at runtime (bundling native modules breaks them).
  serverExternalPackages: ['sharp'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            // 'unsafe-none' (the browser default) fully preserves the
            // opener↔popup relationship that Firebase signInWithPopup relies
            // on to poll window.closed. 'same-origin-allow-popups' was severing
            // that link, producing "COOP policy would block the window.closed
            // call" and breaking Google sign-in.
            key: 'Cross-Origin-Opener-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
