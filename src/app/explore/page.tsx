import Link from "next/link";
import type { Metadata } from "next";
import { Wand2, ArrowRight } from "lucide-react";
import { getGalleryDesigns } from "@/lib/db";
import { designTitle, designAltText } from "@/lib/admin";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import LikeButton from "@/components/LikeButton";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Explore AI room & event designs | RoomGlow",
  description:
    "Browse real AI-generated interior and event designs from one photo. Get inspired, then create your own — free.",
  alternates: { canonical: "/explore" },
};

export const dynamic = "force-dynamic";

type Search = { mode?: string; sort?: string };

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { mode, sort = "top" } = await searchParams;
  const designs = await getGalleryDesigns({ mode, sort });

  const tabs = [
    { label: "All", q: {} },
    { label: "Rooms", q: { mode: "space" } },
    { label: "Events", q: { mode: "event" } },
  ];
  const sorts = [
    { label: "Most liked", val: "top" },
    { label: "Newest", val: "newest" },
  ];
  const qs = (o: Record<string, string | undefined>) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) if (v) clean[k] = v;
    const p = new URLSearchParams(clean).toString();
    return p ? `/explore?${p}` : "/explore";
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-orange-700 flex items-center justify-center">
              <Wand2 size={14} className="text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              RoomGlow
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white font-medium transition-colors"
          >
            Design yours — free
            <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-5 py-8 w-full">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1.5">
          Designs made with RoomGlow
        </h1>
        <p className="text-zinc-500 mb-6">
          Real rooms and events, redesigned by AI from a single photo. Tap any
          design to see the products.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-7">
          {tabs.map((t) => {
            const active = (t.q.mode || "") === (mode || "");
            return (
              <Link
                key={t.label}
                href={qs({ ...t.q, ...(sort !== "top" ? { sort } : {}) })}
                className={`px-3.5 py-1.5 rounded-lg text-sm border transition-colors ${
                  active
                    ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 font-medium"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
          <span className="w-px h-5 bg-zinc-200 dark:bg-zinc-800 mx-1" />
          {sorts.map((s) => (
            <Link
              key={s.val}
              href={qs({ ...(mode ? { mode } : {}), sort: s.val })}
              className={`px-3.5 py-1.5 rounded-lg text-sm border transition-colors ${
                sort === s.val
                  ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {designs.length === 0 ? (
          <div className="text-center py-24 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
            <p className="text-zinc-500">No designs published yet — check back soon.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {designs.map((d) => {
              const title = designTitle(d);
              return (
                <article key={d.id} className="group">
                  <BeforeAfterSlider
                    beforeSrc={d.original_image_url}
                    afterSrc={d.generated_image_url}
                    beforeLabel="Before"
                    afterLabel="RoomGlow"
                  />
                  {/* hidden alt-rich text for SEO */}
                  <span className="sr-only">{designAltText(d)}</span>
                  <div className="flex items-center justify-between gap-3 mt-3">
                    <Link
                      href={`/design/${d.id}`}
                      className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-orange-700 transition-colors line-clamp-1"
                    >
                      {title}
                    </Link>
                    <LikeButton designId={d.id} initialCount={d.like_count || 0} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
