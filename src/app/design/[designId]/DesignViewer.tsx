"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import ImageWithHotspots from "@/components/ImageWithHotspots";
import PaywallOverlay from "@/components/PaywallOverlay";
import LikeButton from "@/components/LikeButton";
import { ArrowLeft, Download, Wand2 } from "lucide-react";

interface DesignData {
  id: string;
  mode: string;
  event_config: Record<string, string> | null;
  products: Array<Record<string, unknown>>;
  hotspots: Array<{ productIndex: number; x: number; y: number; width: number; height: number }>;
  design_narrative: string;
  generated_image_url: string;
  is_unlocked: boolean;
  like_count?: number;
}

function Viewer({
  designId,
  approved,
  initial,
}: {
  designId: string;
  approved: boolean;
  initial: DesignData | null;
}) {
  const router = useRouter();
  const { status } = useSession();
  const [design] = useState<DesignData | null>(initial);
  const [isUnlocked, setIsUnlocked] = useState(
    approved || initial?.is_unlocked || false
  );

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
        if (res.ok) setIsUnlocked(true);
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
      : "Room redesign";

  const showProducts = isUnlocked || approved;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push(approved ? "/explore" : "/")}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">{approved ? "Gallery" : "Back"}</span>
          </button>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {modeLabel}
          </span>
          {isUnlocked && !approved ? (
            <a
              href={design.generated_image_url}
              download
              className="flex items-center gap-1.5 text-sm text-orange-700 hover:text-orange-800 transition-colors"
            >
              <Download size={16} />
              Download
            </a>
          ) : approved ? (
            <LikeButton designId={design.id} initialCount={design.like_count || 0} />
          ) : (
            <span className="w-16" />
          )}
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

        {design.design_narrative && showProducts && (
          <div className="mb-5 border-l-2 border-orange-700 pl-3.5 py-0.5 max-w-2xl">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {design.design_narrative}
            </p>
          </div>
        )}

        <div className="relative">
          <div className={showProducts ? "" : "blur-[24px] pointer-events-none select-none"}>
            <ImageWithHotspots
              imageSrc={design.generated_image_url}
              hotspots={showProducts ? design.hotspots : []}
              products={design.products as never[]}
              hidePrices={approved}
            />
          </div>

          {!isUnlocked && !approved && (
            <PaywallOverlay
              designId={design.id}
              price={design.mode === "event" ? 79 : 49}
              mode={design.mode as "space" | "event"}
              onUnlocked={() => setIsUnlocked(true)}
            />
          )}
        </div>

        {approved && (
          <div className="mt-10 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center">
            <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mx-auto mb-3">
              <Wand2 size={20} className="text-orange-700" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
              Want this for your own space?
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              Upload a photo and RoomGlow designs it for you — free to start.
            </p>
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
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
  initial: DesignData | null;
}) {
  return (
    <SessionProvider>
      <Viewer {...props} />
    </SessionProvider>
  );
}
