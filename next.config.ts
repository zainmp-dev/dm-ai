import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["10.25.25.50", "10.25.25.22", "127.0.0.1"],
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
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval';" : "script-src 'self' 'unsafe-inline';";
    const connectSrc = isDev
      ? "connect-src 'self' http://127.0.0.1:8011 http://localhost:8011 https: ws: wss:;"
      : "connect-src 'self' https:;";
    const csp = `default-src 'self'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; style-src 'self' 'unsafe-inline'; ${scriptSrc} ${connectSrc} frame-ancestors 'none';`;

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microphone=(self) so Web Speech API / voice navigation can request the mic; () would block it entirely.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: csp.replace(/\s+/g, " ").trim(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
