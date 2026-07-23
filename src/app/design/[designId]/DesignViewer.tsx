"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";
import ImageWithHotspots from "@/components/ImageWithHotspots";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import PaywallOverlay from "@/components/PaywallOverlay";
import LikeButton from "@/components/LikeButton";
import UserMenu from "@/components/UserMenu";
import ShareButton from "@/components/ShareButton";
import OccasionProducts from "@/components/OccasionProducts";
import BookDecorCTA from "@/components/BookDecorCTA";
import MakeoverProducts from "@/components/MakeoverProducts";
import InstallPrompt from "@/components/InstallPrompt";
import ManageAccess from "@/components/ManageAccess";
import { RESTYLE_UI_ENABLED } from "@/lib/uiFlags";
import { ArrowLeft, Download, Wand2, Sparkles, RefreshCw } from "lucide-react";

interface DesignData {
  id: string;
  mode: string;
  event_config: Record<string, string> | null;
  products: Array<Record<string, unknown>>;
  hotspots: Array<{ productIndex: number; x: number; y: number; width: number; height: number }>;
  design_narrative: string;
  generated_image_url: string;
  original_image_url?: string;
  is_unlocked: boolean;
  like_count?: number;
  selected_items?: string[] | null;
  removed_items?: string[] | null;
  kept_items?: string[] | null;
}

/** JSONB columns can arrive as an array or a JSON string; normalize to string[]. */
function toLabels(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function Viewer({
  designId,
  approved,
  isOwner = false,
  isAdmin = false,
  galleryStatus = "none",
  initial,
  items = [],
}: {
  designId: string;
  approved: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  galleryStatus?: string;
  initial: DesignData | null;
  items?: string[];
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [design] = useState<DesignData | null>(initial);
  const [isUnlocked, setIsUnlocked] = useState(
    approved || initial?.is_unlocked || false
  );
  const [publishState, setPublishState] = useState<
    "idle" | "sending" | "pending"
  >(galleryStatus === "pending" ? "pending" : "idle");
  const [restyling, setRestyling] = useState<string | null>(null);
  const [restyleError, setRestyleError] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);

  const restyle = async (style: string) => {
    setRestyling(style);
    setRestyleError(null);
    try {
      const res = await fetch("/api/restyle-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, styleHint: style }),
      });
      const data = await res.json();
      if (res.ok && data.designId) {
        router.push(`/design/${data.designId}`);
      } else {
        setRestyleError(data.error || "Restyle failed. Please try again.");
        setRestyling(null);
      }
    } catch {
      setRestyleError("Restyle failed. Please try again.");
      setRestyling(null);
    }
  };

  const submitToGallery = async () => {
    setPublishState("sending");
    try {
      const res = await fetch("/api/gallery/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId }),
      });
      setPublishState(res.ok ? "pending" : "idle");
    } catch {
      setPublishState("idle");
    }
  };

  // Owner can submit their own (non-public) unlocked design to the gallery
  const canPublish =
    !approved &&
    status === "authenticated" &&
    isUnlocked &&
    galleryStatus !== "approved";

  // Owner claim/unlock only for non-approved (private) designs
  useEffect(() => {
    if (approved || !design || isUnlocked) return;
    if (status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/unlock-design", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designId }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.unlocked === true) setIsUnlocked(true);
      } catch {}
    })();
  }, [approved, design, isUnlocked, status, designId]);

  if (!design) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Design not found.</p>
      </div>
    );
  }

  const modeLabel =
    design.mode === "event"
      ? `${design.event_config?.eventLabel || "Event"} decoration`
      : design.mode === "makeover"
      ? `${design.event_config?.styleLabel || "Personal"} makeover`
      : "Room redesign";

  const showProducts = isUnlocked || approved;

  // For locked designs the server hands us the gated route URL (serves a
  // watermarked preview). Once unlocked in-session, bust the cache so the same
  // route re-fetches the now-entitled full-res master.
  const generatedSrc =
    design.generated_image_url.startsWith("/api/image") && isUnlocked
      ? `${design.generated_image_url}?u=1`
      : design.generated_image_url;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              // Real back-navigation so the user returns to where they came
              // from (dashboard, profile, gallery — including scroll/filters).
              // Fresh tabs from shared links have no history → fall back to
              // the gallery. (No referrer check: client-side Next navigations
              // leave document.referrer empty.)
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push(approved ? "/explore" : "/");
              }
            }}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">{approved ? "Gallery" : "Back"}</span>
          </button>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {modeLabel}
          </span>
          <div className="flex items-center gap-2">
            {isUnlocked && !approved && (
              <a
                href={generatedSrc}
                download
                className="hidden sm:flex items-center gap-1.5 text-sm text-orange-700 hover:text-orange-800 transition-colors"
              >
                <Download size={16} />
                Download
              </a>
            )}
            {approved && (
              <>
                {/* Always-visible primary CTA on public gallery designs: converts
                    browsers into creators before they leak out to the Amazon
                    "shop the look" links below. Routes straight to the uploader
                    (sign-in is deferred until after they upload). */}
                <button
                  onClick={() => router.push("/create")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium transition-colors shadow-sm shadow-orange-700/20"
                >
                  <Wand2 size={15} />
                  <span className="hidden sm:inline">Design yours</span>
                  <span className="sm:hidden">Design</span>
                </button>
                <ShareButton designId={design.id} variant="ghost" />
                <LikeButton designId={design.id} initialCount={design.like_count || 0} />
              </>
            )}
            <UserMenu user={session?.user} isAdmin={session?.user?.isAdmin} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 text-xs font-medium mb-2">
            {design.mode === "event" ? "Event design" : "Interior design"}
          </span>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {modeLabel}
          </h2>
        </div>

        {/* Owner-only: manage who can view this (private) design */}
        {isOwner && (
          <div className="mb-5">
            <ManageAccess designId={designId} approved={approved} />
          </div>
        )}

        {showProducts && design.original_image_url && (
          <div className="flex justify-center mb-4">
            <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 text-sm">
              <button
                onClick={() => setShowBefore(false)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  !showBefore
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "text-zinc-500"
                }`}
              >
                Design
              </button>
              <button
                onClick={() => setShowBefore(true)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  showBefore
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "text-zinc-500"
                }`}
              >
                Compare
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          {showProducts && showBefore && design.original_image_url ? (
            <div className="max-w-3xl mx-auto">
              <BeforeAfterSlider
                beforeSrc={design.original_image_url}
                afterSrc={design.generated_image_url}
              />
              <p className="text-center text-xs text-zinc-400 mt-3">
                Drag the handle to compare the original with the new design
              </p>
            </div>
          ) : (
          <div className={showProducts ? "" : "blur-[24px] pointer-events-none select-none sm:max-h-[540px] overflow-hidden"}>
            <ImageWithHotspots
              imageSrc={generatedSrc}
              hotspots={showProducts ? design.hotspots : []}
              products={design.products as never[]}
              // Public/approved designs hide cached Amazon prices, but the owner
              // and admins see full prices + total for review.
              hidePrices={approved && !isOwner && !isAdmin}
            />
          </div>
          )}

          {!isUnlocked && !approved && (
            <PaywallOverlay
              designId={design.id}
              mode={design.mode as "space" | "event"}
              itemCount={design.products?.length ?? 0}
              narrative={design.design_narrative}
              items={items}
              imageUrl={design.generated_image_url}
              onUnlocked={() => setIsUnlocked(true)}
            />
          )}
        </div>

        {/* Design description + what changed — shown BELOW the design so the
            image leads and the reporting doesn't clutter the top. */}
        {design.design_narrative && showProducts && (
          <div className="mt-8 mb-5 border-l-2 border-orange-700 pl-3.5 py-0.5 max-w-2xl">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {design.design_narrative}
            </p>
          </div>
        )}

        {showProducts &&
          (() => {
            const added = toLabels(design.selected_items);
            const kept = toLabels(design.kept_items);
            const removed = toLabels(design.removed_items);
            if (added.length === 0 && kept.length === 0 && removed.length === 0)
              return null;
            return (
              <div className="mb-5 flex flex-col gap-3 max-w-2xl">
                {added.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
                      Added to your design
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {added.map((it) => (
                        <span
                          key={`add-${it}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300 text-xs"
                        >
                          <span aria-hidden>+</span>
                          {it}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {kept.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
                      Kept from your room
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {kept.map((it) => (
                        <span
                          key={`keep-${it}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-xs"
                        >
                          {it}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {removed.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
                      Cleared from the room
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {removed.map((it) => (
                        <span
                          key={`rm-${it}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs line-through"
                        >
                          {it}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        {approved && items.length > 0 && toLabels(design.selected_items).length === 0 && (
          <div className="mb-5">
            <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
              Featured in this design
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((it) => (
                <span
                  key={it}
                  className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs"
                >
                  {it}
                </span>
              ))}
            </div>
          </div>
        )}

        {RESTYLE_UI_ENABLED && isUnlocked && !approved && design.mode === "space" && (
          <div className="mt-8">
            <p className="text-[11px] uppercase tracking-wide text-zinc-400 text-center mb-2">
              {restyling ? `Rendering ${restyling} style…` : "Try a different style"}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Modern", "Bohemian", "Minimalist", "Industrial", "Scandinavian"].map(
                (style) => (
                  <button
                    key={style}
                    onClick={() => restyle(style)}
                    disabled={!!restyling}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm hover:border-orange-700 hover:text-orange-700 dark:hover:border-orange-600 dark:hover:text-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={12} className={restyling === style ? "animate-spin" : ""} />
                    {style}
                  </button>
                )
              )}
            </div>
            <p className="text-center text-xs text-zinc-400 mt-2">
              Each restyle saves as a new design (up to 5).
            </p>
            {restyleError && (
              <p className="text-center text-xs text-red-600 mt-1.5">{restyleError}</p>
            )}
          </div>
        )}

        {showProducts && design.mode === "event" && design.event_config && (
          <OccasionProducts
            eventId={design.event_config.eventType}
            subTheme={design.event_config.subTheme}
            eventLabel={design.event_config.eventLabel || "event"}
          />
        )}

        {showProducts && design.mode === "event" && design.event_config && (
          <BookDecorCTA
            designId={design.id}
            eventLabel={design.event_config.eventLabel || "event"}
          />
        )}

        {showProducts && design.mode === "makeover" && design.event_config?.styleType && (
          <MakeoverProducts
            styleId={design.event_config.styleType}
            gender={design.event_config.gender}
          />
        )}

        {canPublish && (
          <div className="mt-6 flex flex-col items-center gap-1.5">
            {publishState === "pending" ? (
              <p className="text-sm text-zinc-500">
                ✓ Submitted — we&apos;ll review it for the public gallery.
              </p>
            ) : (
              <>
                <button
                  onClick={submitToGallery}
                  disabled={publishState === "sending"}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-sm hover:border-orange-700 hover:text-orange-700 transition-colors disabled:opacity-50"
                >
                  <Sparkles size={15} />
                  {publishState === "sending" ? "Submitting…" : "Add to public gallery"}
                </button>
                <p className="text-xs text-zinc-400">
                  Share your design with others (reviewed before it goes live).
                </p>
              </>
            )}
          </div>
        )}

        {isUnlocked && !approved && <InstallPrompt />}

        {approved && (
          <div className="mt-10 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center">
            <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mx-auto mb-3">
              <Wand2 size={20} className="text-orange-700" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
              Want this for your own space?
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              Upload a photo and Noosho designs it for you — free to start, no
              sign-in needed.
            </p>
            <button
              onClick={() => router.push("/create")}
              className="px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white font-medium text-sm rounded-lg transition-colors"
            >
              Design your own room
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DesignViewer(props: {
  designId: string;
  approved: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  galleryStatus?: string;
  initial: DesignData | null;
  items?: string[];
}) {
  return (
    <SessionProvider>
      <Viewer {...props} />
    </SessionProvider>
  );
}
