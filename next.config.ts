import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  headers: async () => [
    {
      // HTML pages: always revalidate so stale JS bundles don't persist
      source: "/((?!_next/static|_next/image|favicon|manifest|.*\\.(?:svg|png|jpg|ico|webp)$).*)",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      ],
    },
  ],
};

export default nextConfig;
