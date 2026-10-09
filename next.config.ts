import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite compilar numa pasta à parte (NEXT_DIST_DIR=.next-test) sem mexer no build que o serviço está usando.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
