import Link from "next/link";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { Wand2, ArrowRight, Sofa, PartyPopper, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { getGalleryCards } from "@/lib/db";
import {
  designTitle,
  designAltText,
  designRoomType,
  designEventType,
  matchesQuery,
  isAdminEmail,
} from "@/lib/admin";
import SiteHeader from "@/components/SiteHeader";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import LikeButton from "@/components/LikeButton";
import ShareButton from "@/components/ShareButton";
import GallerySearch from "@/components/GallerySearch";
import AdminDeleteButton from "@/components/AdminDeleteButton";
import Footer from "@/components/Footer";
import TiltCard from "@/components/TiltCard";

export const metadata: Metadata = {
  title: "Noosho — AI room & event designs from one photo",
  description:
    "Browse real AI-generated interior and event designs, each shoppable from a single photo. Find inspiration, then design your own — free.",
  alternates: { canonical: "/" },
};

type Search = { type?: string; sort?: string; room?: string; event?: string; q?: string; page?: string };

const PAGE_SIZE = 24;

// The approved gallery changes infrequently (admin-gated). Cache the full
// lightweight set so the homepage no longer issues a 200-row query on every
// visit; refreshed every 5 min, or immediately when a design is approved via
// revalidateTag("gallery"). Facets/filtering/paging run in JS over this cached
// set, so they cost nothing per request (P1-a).
const getCachedGalleryCards = (sort: string) =>
  unstable_cache(
    () => getGalleryCards({ sort, limit: 200 }),
    ["gallery-cards", sort],
    { tags: ["gallery"], revalidate: 300 }
  )();

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { type, sort = "top", room, event, q = "", page: pageParam } = await searchParams;
  const mode = type === "space" || type === "event" ? type : undefined;
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  // Fetch all approved (lightweight, cached) so facets reflect the whole
  // gallery; filter in JS. auth() stays uncached (per-request session).
  const [allCards, session] = await Promise.all([
    getCachedGalleryCards(sort),
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

  const totalPages = Math.max(1, Math.ceil(designs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDesigns = designs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs border transition-colors capitalize ${
      active
        ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300"
        : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300"
    }`;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex flex-col">
      <SiteHeader
        user={session?.user}
        isAdmin={isAdminEmail(session?.user?.email)}
        center={
          <div className="max-w-xl hidden sm:block">
            <Suspense fallback={null}>
              <GallerySearch size="lg" />
            </Suspense>
          </div>
        }
      />
      {/* Mobile search row */}
      <div className="sm:hidden border-b border-zinc-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 px-5 py-2.5">
        <Suspense fallback={null}>
          <GallerySearch size="lg" />
        </Suspense>
      </div>

      <main className="flex-1 max-w-6xl mx-auto px-5 py-7 w-full">
        {/* Hero */}
        <div className="relative mb-7">
          <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-hero-glow animate-glow-drift" />
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 dark:bg-zinc-900/70 border border-orange-200/60 dark:border-orange-900/40 text-xs font-medium text-orange-800 dark:text-orange-300 mb-3 backdrop-blur-sm">
                <Sparkles size={13} className="text-orange-700" />
                Real designs from real photos
              </div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1]">
                See your room redesigned —{" "}
                <span className="text-orange-700">then buy the look</span>
              </h1>
              <p className="text-zinc-500 mt-2 text-base sm:text-lg">
                Snap one photo. Noosho restyles your space and finds every piece
                to shop. Free to try.
              </p>
            </div>
            <Link
              href="/create"
              className="group hidden sm:inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800 transition-all shadow-lg shadow-orange-700/20 hover:shadow-orange-700/30"
            >
              <Wand2 size={16} />
              Design your own — free
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Filters — one compact row; category chips only for the active tab */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {tabs.map((t) => {
                const active = (t.type || "") === (mode || "");
                return (
                  <Link
                    key={t.label}
                    href={qs({ type: t.type, ...keep })}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      active
                        ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 font-medium"
                        : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-3 shrink-0 text-sm">
              {sorts.map((s) => (
                <Link
                  key={s.val}
                  href={qs({ type: mode, room, event, sort: s.val, q: q || undefined })}
                  className={`transition-colors ${
                    sort === s.val
                      ? "text-zinc-900 dark:text-zinc-100 font-medium"
                      : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Category facets — only for the active tab, single scrollable row */}
          {mode === "space" && roomFacets.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link href={qs({ type: "space", ...keep })} className={chip(!room)}>
                All rooms
              </Link>
              {roomFacets.map((r) => (
                <Link key={r} href={qs({ type: "space", room: r, ...keep })} className={chip(room === r)}>
                  {r}
                </Link>
              ))}
            </div>
          )}
          {mode === "event" && eventFacets.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link href={qs({ type: "event", ...keep })} className={chip(!event)}>
                All events
              </Link>
              {eventFacets.map((e) => (
                <Link key={e} href={qs({ type: "event", event: e, ...keep })} className={chip(event === e)}>
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
            {pageDesigns.map((d, i) => (
              <TiltCard
                key={d.id}
                className="animate-card-in"
                style={{ animationDelay: `${Math.min(i, 11) * 45}ms` }}
              >
              <article
                className="group rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-orange-200 dark:hover:border-orange-900/50 hover:shadow-xl hover:shadow-orange-900/5 transition-all duration-200"
              >
                <div className="relative">
                  <BeforeAfterSlider
                    beforeSrc={d.original_image_url}
                    afterSrc={d.generated_image_url}
                    blurBefore={d.original_blur}
                    blurAfter={d.generated_blur}
                    aspect="aspect-[4/3]"
                    rounded={false}
                    showLabels={false}
                    priority={i < 4}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                  <span
                    className={`absolute top-2 left-2 z-10 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm pointer-events-none ${
                      d.mode === "event"
                        ? "bg-purple-100/90 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300"
                        : d.mode === "makeover"
                        ? "bg-pink-100/90 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300"
                        : "bg-teal-100/90 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300"
                    }`}
                  >
                    {d.mode === "event" ? (
                      <PartyPopper size={10} />
                    ) : d.mode === "makeover" ? (
                      <Sparkles size={10} />
                    ) : (
                      <Sofa size={10} />
                    )}
                    {d.mode === "event"
                      ? d.event_config?.eventLabel || "Event"
                      : d.mode === "makeover"
                      ? "Makeover"
                      : "Space"}
                  </span>
                  <span className="sr-only">{designAltText(d)}</span>
                  {isAdminEmail(session?.user?.email) && (
                    <AdminDeleteButton designId={d.id} />
                  )}
                </div>
                <div className="px-3 pt-2.5">
                  <Link
                    href={`/design/${d.id}`}
                    className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-orange-700 transition-colors line-clamp-1 block"
                  >
                    {designTitle(d)}
                  </Link>
                </div>
                <div className="flex items-center justify-between px-3 pb-2.5 pt-1.5">
                  <LikeButton designId={d.id} initialCount={d.like_count || 0} />
                  <ShareButton designId={d.id} variant="ghost" />
                </div>
              </article>
              </TiltCard>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-10">
            {safePage > 1 ? (
              <Link
                href={qs({ type: mode, room, event, sort: sort !== "top" ? sort : undefined, q: q || undefined, page: String(safePage - 1) })}
                className="px-4 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
              >
                Previous
              </Link>
            ) : (
              <span className="px-4 py-2 rounded-lg text-sm border border-zinc-100 dark:border-zinc-900 text-zinc-300 dark:text-zinc-700">
                Previous
              </span>
            )}
            <span className="text-sm text-zinc-500">
              Page {safePage} of {totalPages}
            </span>
            {safePage < totalPages ? (
              <Link
                href={qs({ type: mode, room, event, sort: sort !== "top" ? sort : undefined, q: q || undefined, page: String(safePage + 1) })}
                className="px-4 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
              >
                Next
              </Link>
            ) : (
              <span className="px-4 py-2 rounded-lg text-sm border border-zinc-100 dark:border-zinc-900 text-zinc-300 dark:text-zinc-700">
                Next
              </span>
            )}
          </div>
        )}

        {/* Closing CTA */}
        {designs.length > 0 && (
          <div className="relative overflow-hidden rounded-3xl bg-zinc-900 dark:bg-zinc-800 px-8 py-12 text-center mt-12">
            <div className="absolute inset-0 -z-0 bg-cta-glow opacity-80" />
            <div className="relative z-10">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-2">
                Your room could be next
              </h2>
              <p className="text-zinc-300 mb-6 max-w-md mx-auto text-sm sm:text-base">
                Upload one photo and get a designer-quality redesign with every
                product ready to shop.
              </p>
              <Link
                href="/create"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-zinc-900 bg-white hover:bg-zinc-100 transition-colors"
              >
                <Wand2 size={16} />
                Design your own — free
              </Link>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
