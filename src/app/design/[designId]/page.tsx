import type { Metadata } from "next";
import { getDesign } from "@/lib/db";
import { designTitle, designAltText } from "@/lib/admin";
import DesignViewer from "./DesignViewer";

const BASE = process.env.NEXTAUTH_URL || "https://roomglow-one.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ designId: string }>;
}): Promise<Metadata> {
  const { designId } = await params;
  const d = await getDesign(designId);
  if (!d) return { title: "Design — RoomGlow" };

  const title = `${designTitle(d)} | RoomGlow`;
  const description =
    (d.design_narrative as string)?.slice(0, 155) ||
    "An AI-generated room design with shoppable products, made with RoomGlow.";
  const ogImage = `${BASE}/api/og/${designId}`;
  const isPublic = d.gallery_status === "approved";

  return {
    title,
    description,
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

  // JSON-LD for approved (public) designs — Product list WITHOUT price/offer
  let jsonLd: string | null = null;
  if (d && approved) {
    const products = (d.products as ProductRow[]) || [];
    jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: designTitle(d),
      description: d.design_narrative || undefined,
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
            url: p.amazonProduct?.affiliateUrl,
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
      {/* SSR alt-rich heading for crawlers (hidden visually; viewer renders its own) */}
      {d && approved && (
        <h1 className="sr-only">{designAltText(d)}</h1>
      )}
      <DesignViewer
        designId={designId}
        approved={approved}
        initial={
          d
            ? {
                id: d.id,
                mode: d.mode,
                event_config: d.event_config,
                products: d.products,
                hotspots: d.hotspots,
                design_narrative: d.design_narrative,
                generated_image_url: d.generated_image_url,
                is_unlocked: d.is_unlocked,
              }
            : null
        }
      />
    </>
  );
}
