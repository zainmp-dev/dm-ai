import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["10.25.25.50"],
  // API calls use `app/api/backend/[[...path]]/route.ts` to proxy to FastAPI. Do not add a duplicate
  // rewrite for `/api/backend/*` here — that can double-proxy or break HTTP methods in dev.
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
