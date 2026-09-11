import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname_local = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  turbopack: {
    // Pin the workspace root to this folder so Turbopack doesn't
    // wander up to the monorepo parent and lose track of the app
    // routes (caused every /studio/* request to silently fall through
    // to /_not-found).
    root: __dirname_local,
  },
  async rewrites() {
    const apiTarget = process.env.STLS_API_PROXY_TARGET ?? "http://127.0.0.1:4010";

    return [
      {
        source: "/stls-api/socket.io",
        destination: `${apiTarget}/socket.io/`,
      },
      {
        source: "/stls-api/socket.io/:path*",
        destination: `${apiTarget}/socket.io/:path*`,
      },
      {
        source: "/stls-api/:path*",
        destination: `${apiTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
