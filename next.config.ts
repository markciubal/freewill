import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // A stray package-lock.json exists one directory up; pin the workspace root here.
  turbopack: { root: __dirname },
};

export default nextConfig;
