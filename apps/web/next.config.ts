import { assertNoServerSecretsInPublicEnv } from '@medsphere/config';
import type { NextConfig } from 'next';

assertNoServerSecretsInPublicEnv(process.env);

const PUBLIC_STATIC_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';
const SERVICE_WORKER_CACHE = 'no-cache, no-store, must-revalidate';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: PUBLIC_STATIC_CACHE }],
      },
      {
        source: '/icon.svg',
        headers: [{ key: 'Cache-Control', value: PUBLIC_STATIC_CACHE }],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: SERVICE_WORKER_CACHE }],
      },
    ];
  },
};

export default nextConfig;
