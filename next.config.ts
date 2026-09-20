import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "qrcode"],
  // A stray package-lock.json exists one directory up; pin the workspace root here.
  turbopack: { root: __dirname },
  // Headers that are the same for every response. The per-request
  // Content-Security-Policy (it carries a nonce) is set in src/proxy.ts.
  async headers() {
    return [{ source: "/(.*)", headers: staticSecurityHeaders({ isProduction: process.env.NODE_ENV === "production" }) }];
  },
};

export default nextConfig;
