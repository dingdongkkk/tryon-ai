import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // Camera access only for this origin
    return [{ source: "/(.*)", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=()" }] }];
  },
};

export default nextConfig;
