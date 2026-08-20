import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  turbopack: {},
  // sharp's linux binary loads, but the libvips shared object it links against
  // is a NESTED optional dependency (@img/sharp-linux-x64 -> libvips-linux-x64)
  // and file tracing was shipping the .node without the .so. Every route that
  // imports gemini.ts or images.ts then died at module load with
  // "ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file",
  // which took the whole create pipeline down at /api/analyze-room. Forcing the
  // whole @img tree into the trace keeps the pair together.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@img/**"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Cache optimized variants for a day so warm loads skip re-optimization.
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "images-na.ssl-images-amazon.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default withPWA(nextConfig);
