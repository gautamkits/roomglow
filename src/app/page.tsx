import Link from "next/link";
import type { Metadata } from "next";
import { Wand2, ArrowRight, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { getGalleryCards } from "@/lib/db";
import { designTitle, designAltText } from "@/lib/admin";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import LikeButton from "@/components/LikeButton";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "RoomGlow — AI room & event designs from one photo",
  description:
    "Browse real AI-generated interior and event designs, each shoppable from a single photo. Find inspiration, then design your own — free.",
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

type Search = { type?: string; sort?: string };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { type, sort = "top" } = await searchParams;
  const mode = type === "space" || type === "event" ? type : undefined;
  const [designs, session] = await Promise.all([
    getGalleryCards({ mode, sort }),
    auth(),
  ]);

  const tabs = [
    { label: "All", type: "" },
    { label: "Rooms", type: "space" },
    { label: "Events", type: "event" },
  ];
  const sorts = [
    { label: "Most liked", val: "top" },
    { label: "Newest", val: "newest" },
  ];
  const qs = (o: Record<string, string | undefined>) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) if (v) clean[k] = v;
    const p = new URLSearchParams(clean).toString();
    return p ? `/?${p}` : "/";
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="w-6 h-6 rounded-md bg-orange-700 flex items-center justify-center">
              <Wand2 size={14} className="text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              RoomGlow
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {session?.user && (
              <Link
                href="/profile"
                className="hidden sm:inline text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                My designs
              </Link>
            )}
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white font-medium transition-colors"
            >
              <Sparkles size={14} />
              Design your own
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-5 py-7 w-full">
        <div className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Designs made from a single photo
          </h1>
          <p className="text-zinc-500 mt-1">
            Drag any card to reveal the transformation. Tap to shop the look —
            or design your own room, free.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-7">
          {tabs.map((t) => {
            const active = (t.type || "") === (mode || "");
            return (
              <Link
                key={t.label}
                href={qs({ type: t.type, sort: sort !== "top" ? sort : undefined })}
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
              href={qs({ type: mode, sort: s.val })}
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
          <div className="text-center py-20 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
            <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mx-auto mb-4">
              <Wand2 size={22} className="text-orange-700" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
              Be the first to share a design
            </h2>
            <p className="text-sm text-zinc-500 mb-5 max-w-sm mx-auto">
              Upload a room photo, get an AI redesign you can shop, and publish
              it to the gallery.
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white font-medium text-sm rounded-lg transition-colors"
            >
              Design your own — free
              <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {designs.map((d) => (
              <article key={d.id} className="group">
                <BeforeAfterSlider
                  beforeSrc={`/api/image/${d.id}/before`}
                  afterSrc={`/api/image/${d.id}/after`}
                  beforeLabel="Before"
                  afterLabel="RoomGlow"
                />
                <span className="sr-only">{designAltText(d)}</span>
                <div className="flex items-center justify-between gap-3 mt-3">
                  <Link
                    href={`/design/${d.id}`}
                    className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-orange-700 transition-colors line-clamp-1"
                  >
                    {designTitle(d)}
                  </Link>
                  <LikeButton designId={d.id} initialCount={d.like_count || 0} />
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
