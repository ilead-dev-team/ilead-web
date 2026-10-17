import type { NextConfig } from "next";
const api = new URL(process.env.API_ORIGIN ?? "http://127.0.0.1:4000");
if (
  !["http:", "https:"].includes(api.protocol) ||
  api.username ||
  api.password ||
  api.pathname !== "/" ||
  api.search ||
  api.hash
)
  throw new Error(
    "API_ORIGIN must be an HTTP(S) origin without credentials or a path.",
  );
if (
  process.env.NODE_ENV === "production" &&
  api.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(api.hostname)
)
  throw new Error("Remote production API_ORIGIN must use HTTPS.");
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${api.origin}/api/v1/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
