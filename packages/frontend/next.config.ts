import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@chainlens/shared"],
  output: "standalone",
};

export default nextConfig;
