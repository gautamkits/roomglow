import type { MetadataRoute } from "next";
import { getApprovedDesignIds } from "@/lib/db";

const BASE = process.env.NEXTAUTH_URL || "https://roomglow-one.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/explore", "/about", "/contact", "/privacy", "/terms", "/refund"].map(
    (p) => ({
      url: `${BASE}${p || "/"}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: p === "" ? 1 : 0.6,
    })
  );

  let designRoutes: MetadataRoute.Sitemap = [];
  try {
    const designs = await getApprovedDesignIds();
    designRoutes = designs.map((d) => ({
      url: `${BASE}/design/${d.id}`,
      lastModified: d.published_at ? new Date(d.published_at) : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    // DB unavailable at build — return static only
  }

  return [...staticRoutes, ...designRoutes];
}
