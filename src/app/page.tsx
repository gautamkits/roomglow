import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Wand2, ArrowRight, Sparkles, Sofa, PartyPopper } from "lucide-react";
import { auth } from "@/auth";
import { getGalleryCards } from "@/lib/db";
import {
  designTitle,
  designAltText,
  designRoomType,
  designEventType,
  matchesQuery,
} from "@/lib/admin";
import LikeButton from "@/components/LikeButton";
import ShareButton from "@/components/ShareButton";
import GallerySearch from "@/components/GallerySearch";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "RoomGlow — AI room & event designs from one photo",
  description:
    "Browse real AI-generated interior and event designs, each shoppable from a single photo. Find inspiration, then design your own — free.",
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

type Search = { type?: string; sort?: string; room?: string; event?: string; q?: string };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { type, sort = "top", room, event, q = "" } = await searchParams;
  const mode = type === "space" || type === "event" ? type : undefined;

  // Fetch all approved (lightweight) so facets reflect the whole gallery; filter in JS.
  const [allCards, session] = await Promise.all([
    getGalleryCards({ sort, limit: 200 }),
    auth(),
  ]);

  // Facets from the full approved set
  const roomFacets = [
    ...new Set(
      allCards
        .filter((d) => d.mode === "space")
        .map((d) => designRoomType(d))
        .filter(Boolean) as string[]
    ),
  ].sort();
  const eventFacets = [
    ...new Set(
      allCards
        .filter((d) => d.mode === "event")
        .map((d) => designEventType(d))
        .filter(Boolean) as string[]
    ),
  ].sort();

  // Apply filters
  const designs = allCards.filter((d) => {
    if (mode && d.mode !== mode) return false;
    if (room && designRoomType(d) !== room.toLowerCase()) return false;
    if (event && designEventType(d) !== event) return false;
    if (q && !matchesQuery(d, q)) return false;
    return true;
  });

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
  const keep = { sort: sort !== "top" ? sort : undefined, q: q || undefined };

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

          {/* Hero search bar (Flipkart-style) */}
          <div className="flex-1 max-w-xl hidden sm:block">
            <Suspense fallback={null}>
              <GallerySearch size="lg" />
            </Suspense>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {session?.user && (
              <Link
                href="/profile"
                className="hidden md:inline text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                My designs
              </Link>
            )}
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white font-medium transition-colors"
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline">Design your own</span>
              <span className="sm:hidden">Design</span>
            </Link>
          </div>
        </div>

        {/* Mobile search row */}
        <div className="sm:hidden border-t border-zinc-100 dark:border-zinc-800 px-5 py-2.5 max-w-6xl mx-auto">
          <Suspense fallback={null}>
            <GallerySearch size="lg" />
          </Suspense>
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
        <div className="flex flex-col gap-3 mb-7">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => {
              const active = (t.type || "") === (mode || "");
              return (
                <Link
                  key={t.label}
                  href={qs({ type: t.type, ...keep })}
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
                href={qs({ type: mode, room, event, sort: s.val, q: q || undefined })}
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

          {/* Room facets (when Rooms or All) */}
          {mode !== "event" && roomFacets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={qs({ type: mode, ...keep })}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors capitalize ${
                  !room
                    ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300"
                }`}
              >
                All rooms
              </Link>
              {roomFacets.map((r) => (
                <Link
                  key={r}
                  href={qs({ type: "space", room: r, ...keep })}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors capitalize ${
                    room === r
                      ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  {r}
                </Link>
              ))}
            </div>
          )}

          {/* Event facets (when Events or All) */}
          {mode !== "space" && eventFacets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={qs({ type: mode, ...keep })}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  !event
                    ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300"
                }`}
              >
                All events
              </Link>
              {eventFacets.map((e) => (
                <Link
                  key={e}
                  href={qs({ type: "event", event: e, ...keep })}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    event === e
                      ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  {e}
                </Link>
              ))}
            </div>
          )}
        </div>

        {designs.length === 0 && allCards.length > 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
            <p className="text-zinc-500 mb-3">No designs match these filters.</p>
            <Link href="/" className="text-sm font-medium text-orange-700 hover:text-orange-800">
              Clear filters
            </Link>
          </div>
        ) : designs.length === 0 ? (
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {designs.map((d) => (
              <article
                key={d.id}
                className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all"
              >
                <Link href={`/design/${d.id}`} className="group block">
                  <div className="aspect-[4/3] relative overflow-hidden bg-stone-100 dark:bg-zinc-800">
                    <img
                      src={`/api/image/${d.id}/after`}
                      alt={designAltText(d)}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    <span
                      className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${
                        d.mode === "event"
                          ? "bg-purple-100/90 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300"
                          : "bg-teal-100/90 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300"
                      }`}
                    >
                      {d.mode === "event" ? (
                        <PartyPopper size={10} />
                      ) : (
                        <Sofa size={10} />
                      )}
                      {d.mode === "event"
                        ? d.event_config?.eventLabel || "Event"
                        : "Space"}
                    </span>
                  </div>
                  <div className="px-3 pt-2.5">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">
                      {designTitle(d)}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center justify-between px-3 pb-2.5 pt-1.5">
                  <LikeButton designId={d.id} initialCount={d.like_count || 0} />
                  <ShareButton designId={d.id} variant="ghost" />
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
