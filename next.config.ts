import type { NextConfig } from "next";

const NO_STORE_HEADERS = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
  { key: "Surrogate-Control", value: "no-store" },
  { key: "CDN-Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  serverExternalPackages: ["@prisma/client", ".prisma/client", "prisma"],
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.prisma/client/**",
      "./node_modules/@prisma/client/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/api/:path((?!files/).*)",
        headers: NO_STORE_HEADERS,
      },
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: NO_STORE_HEADERS,
      },
    ];
  },
};

export default nextConfig;
