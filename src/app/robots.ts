import type { MetadataRoute } from "next";
import { SITE_URL as BASE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/profile"] },
      // Explicitly welcome AI crawlers (but never the affiliate redirector)
      { userAgent: "GPTBot", allow: "/", disallow: ["/api/go"] },
      { userAgent: "ClaudeBot", allow: "/", disallow: ["/api/go"] },
      { userAgent: "PerplexityBot", allow: "/", disallow: ["/api/go"] },
      { userAgent: "Google-Extended", allow: "/", disallow: ["/api/go"] },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
