import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',

  // Proxy all /api/* requests to the Fastify backend
  // In production, Nginx handles this; in dev, Next.js rewrites handle it.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env['BACKEND_URL'] ?? 'http://localhost:4000'}/:path*`,
      },
    ];
  },

  // Strict security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
