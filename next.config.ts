import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["10.25.25.50"],
  // Local media uploads POST base64 JSON; an 8MB file is ~11MB+ in the body. Default ~10MB buffer truncates
  // the request and breaks parsing upstream. See Next.js `experimental.proxyClientMaxBodySize`.
  experimental: {
    proxyClientMaxBodySize: "20mb",
  },
  // API calls use `app/api/backend/[[...path]]/route.ts` to proxy to FastAPI. Do not add a duplicate
  // rewrite for `/api/backend/*` here — that can double-proxy or break HTTP methods in dev.
  async redirects() {
    return [{ source: "/calendar", destination: "/pipeline?tab=scheduling", permanent: true }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
