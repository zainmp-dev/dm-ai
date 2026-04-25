import type { NextConfig } from "next";

const backend = process.env.BACKEND_PROXY_URL ?? "http://127.0.0.1:8001";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["10.25.25.50"],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
  async redirects() {
    return [{ source: "/calendar", destination: "/scheduling", permanent: true }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
