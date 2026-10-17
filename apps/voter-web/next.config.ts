import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'export', poweredByHeader: false,
  turbopack: { resolveAlias: {
    fs: { browser: './app/maci-empty.ts' },
    os: { browser: './app/maci-empty.ts' },
    crypto: { browser: './app/maci-browser-crypto.ts' },
  } },
};
export default config;
