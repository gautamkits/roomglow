"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";
import ImageWithHotspots from "@/components/ImageWithHotspots";
import PaywallOverlay from "@/components/PaywallOverlay";
import { ArrowLeft, Download } from "lucide-react";

interface DesignData {
  id: string;
  mode: string;
  event_config: Record<string, string> | null;
  products: Array<Record<string, unknown>>;
  hotspots: Array<{ productIndex: number; x: number; y: number; width: number; height: number }>;
  design_narrative: string;
  original_image_url: string;
  generated_image_url: string;
  is_unlocked: boolean;
}

function DesignView() {
  const params = useParams();
  const router = useRouter();
  const { status } = useSession();
  const [design, setDesign] = useState<DesignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    if (status === "loading") return;

    (async () => {
      try {
        const res = await fetch(`/api/design/${params.designId}`);
        const d: DesignData = await res.json();

        // If signed in and the design isn't claimed/unlocked yet, claim it.
        if (status === "authenticated" && !d.is_unlocked) {
          try {
            const unlockRes = await fetch("/api/unlock-design", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ designId: params.designId }),
            });
            if (unlockRes.ok) d.is_unlocked = true;
          } catch {}
        }

        setDesign(d);
        setIsUnlocked(d.is_unlocked);
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.designId, router, status]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!design) return null;

  const modeLabel = design.mode === "event"
    ? `${design.event_config?.eventLabel || "Event"} decoration`
    : "Space redesign";

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.push("/")} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-700 transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{modeLabel}</span>
          {isUnlocked && (
            <a
              href={design.generated_image_url}
              download
              className="flex items-center gap-1.5 text-sm text-orange-700 hover:text-orange-800 transition-colors"
            >
              <Download size={16} />
              Download
            </a>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 text-xs font-medium mb-2">
            {design.mode === "event" ? "Event design" : "Interior design"}
          </span>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {modeLabel}
          </h1>
        </div>

        {design.design_narrative && isUnlocked && (
          <div className="mb-5 border-l-2 border-orange-700 pl-3.5 py-0.5 max-w-2xl">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {design.design_narrative}
            </p>
          </div>
        )}

        <div className="relative">
          <div className={isUnlocked ? "" : "blur-[24px] pointer-events-none select-none"}>
            <ImageWithHotspots
              imageSrc={design.generated_image_url}
              hotspots={isUnlocked ? design.hotspots : []}
              products={design.products as never[]}
            />
          </div>

          {!isUnlocked && (
            <PaywallOverlay
              designId={design.id}
              price={design.mode === "event" ? 79 : 49}
              mode={design.mode as "space" | "event"}
              onUnlocked={() => setIsUnlocked(true)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default function DesignPage() {
  return (
    <SessionProvider>
      <DesignView />
    </SessionProvider>
  );
}
