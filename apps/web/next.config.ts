import { assertNoServerSecretsInPublicEnv } from '@medsphere/config';
import type { NextConfig } from 'next';

assertNoServerSecretsInPublicEnv(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
