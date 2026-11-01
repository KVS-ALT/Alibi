import type { NextConfig } from "next";
import path from 'node:path';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/api/**/*': ['./lib/prompts/portfolio-guide.md'] },
  transpilePackages: ["@alibi/shared"],
  turbopack: {root:path.resolve(__dirname,'..')},
};

export default nextConfig;
