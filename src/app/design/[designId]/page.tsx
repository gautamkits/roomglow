import type { Metadata } from "next";
import { auth } from "@/auth";
import { getDesign } from "@/lib/db";
import { designVisibility } from "@/lib/access";
import AccessGate from "@/components/AccessGate";
import {
  designTitle,
  designAltText,
  designDescription,
  designKeywords,
  designItems,
} from "@/lib/admin";
import DesignViewer from "./DesignViewer";
import { SITE_URL as BASE } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ designId: string }>;
}): Promise<Metadata> {
  const { designId } = await params;
  const d = await getDesign(designId);
  if (!d) return { title: "Design — Noosho" };

  // Private designs get generic metadata — no room details, keywords, or a real
  // OG image (the OG route serves a branded fallback for non-approved designs),
  // so nothing about the design leaks through crawlers or link previews.
  if (d.gallery_status !== "approved") {
    return {
      title: "A design on Noosho",
      description: "This design is private. Sign in to view it if it was shared with you.",
      robots: { index: false },
    };
  }

  const items = designItems(d);
  const itemSuffix = items.length ? ` with ${items.slice(0, 3).join(", ")}` : "";
  const title = `${designTitle(d)}${itemSuffix} | Noosho`;
  const description = designDescription(d);
  const ogImage = `${BASE}/api/og/${designId}`;
  const isPublic = d.gallery_status === "approved";

  return {
    title,
    description,
    keywords: designKeywords(d),
    alternates: { canonical: `${BASE}/design/${designId}` },
    robots: isPublic ? undefined : { index: false },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${BASE}/design/${designId}`,
      images: [{ url: ogImage, width: 1024, height: 1024 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

interface ProductRow {
  recommendation?: { category?: string };
  amazonProduct?: { title?: string; imageUrl?: string; affiliateUrl?: string };
}

export default async function DesignPage({
  params,
}: {
  params: Promise<{ designId: string }>;
}) {
  const { designId } = await params;
  const d = await getDesign(designId);
  const approved = d?.gallery_status === "approved";

  // Privacy gate: private designs render only for the owner, admins, and the
  // emails they were shared with (see designVisibility).
  const session = await auth();
  const { canView, isOwner } = d
    ? await designVisibility(d, session)
    : { canView: true, isOwner: false };
  if (d && !canView) {
    return <AccessGate viewerEmail={session?.user?.email ?? null} />;
  }

  // JSON-LD for approved (public) designs — Product list WITHOUT price/offer
  let jsonLd: string | null = null;
  if (d && approved) {
    const products = (d.products as ProductRow[]) || [];
    jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: designTitle(d),
      description: designDescription(d),
      keywords: designKeywords(d).join(", "),
      image: `${BASE}/api/og/${designId}`,
      url: `${BASE}/design/${designId}`,
      about: {
        "@type": "ItemList",
        itemListElement: products.slice(0, 10).map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Product",
            name: p.amazonProduct?.title || p.recommendation?.category,
            image: p.amazonProduct?.imageUrl,
            // Point at the on-site design page, never the tagged affiliate URL —
            // keeps affiliate links out of crawlable structured data.
            url: `${BASE}/design/${designId}`,
          },
        })),
      },
    });
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      )}
      {/* SSR crawlable content for approved (public) designs */}
      {d && approved && (
        <div className="sr-only">
          <h1>{designAltText(d)}</h1>
          {d.design_narrative && <p>{d.design_narrative}</p>}
          <h2>Featured in this design</h2>
          <ul>
            {designItems(d).map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </div>
      )}
      <DesignViewer
        designId={designId}
        approved={approved}
        isOwner={isOwner}
        galleryStatus={d?.gallery_status || "none"}
        items={d ? designItems(d) : []}
        initial={
          d
            ? {
                id: d.id,
                mode: d.mode,
                event_config: d.event_config,
                products: d.products,
                hotspots: d.hotspots,
                design_narrative: d.design_narrative,
                // Never hand the full-res master to the client for a locked
                // design — route through the gated endpoint, which serves the
                // watermarked preview until the design is unlocked/approved (R1).
                generated_image_url:
                  d.is_unlocked || approved
                    ? d.generated_image_url
                    : `/api/image/${d.id}/after`,
                // Only expose the original (for before/after compare) once
                // entitled — never alongside a locked/paywalled design.
                original_image_url:
                  d.is_unlocked || approved ? d.original_image_url : undefined,
                is_unlocked: d.is_unlocked,
              }
            : null
        }
      />
    </>
  );
}
