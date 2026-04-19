import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@chain-lens/shared"],
  output: "standalone",
};

export default nextConfig;
