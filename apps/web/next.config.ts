import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const upstream = (process.env.API_URL || "http://127.0.0.1:4000").replace(
      /\/$/,
      "",
    );
    return [
      {
        source: "/api/admin/:path*",
        destination: upstream + "/api/admin/:path*",
      },
    ];
  },
};
export default nextConfig;
