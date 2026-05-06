import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
module.exports = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\.ts$/,
      exclude: /supabase/,
    })
    return config
  }
}