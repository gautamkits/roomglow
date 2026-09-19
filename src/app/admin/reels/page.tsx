"use client";

import { useCallback, useEffect, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import type { ReelItem } from "@/lib/reels";

// Posting console for automation (Muse) and humans alike: every published
// design with a server-rendered reel MP4 and its caption.

function ReelCard({ reel }: { reel: ReelItem }) {
  const [copied, setCopied] = useState(false);

  return (
    <div data-design-id={reel.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={reel.thumbnailUrl} alt={reel.title} className="w-full aspect-[4/3] object-cover" loading="lazy" />
      <div className="p-4 space-y-3">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{reel.title}</h2>
        <div className="flex flex-wrap gap-2">
          <a
            href={reel.videoUrl}
            download={`noosho-${reel.id}.mp4`}
            className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-orange-700 hover:bg-orange-800"
          >
            Download MP4
          </a>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(reel.caption);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700"
          >
            {copied ? "Copied" : "Copy caption"}
          </button>
        </div>
        <p className="text-[11px] text-zinc-400">
          First download of a design takes ~30s while the video renders.
        </p>
        <details>
          <summary className="text-xs text-zinc-500 cursor-pointer">Caption</summary>
          <pre className="caption mt-2 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300">{reel.caption}</pre>
        </details>
      </div>
    </div>
  );
}

function Reels() {
  const { status } = useSession();
  const [reels, setReels] = useState<ReelItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reels");
    if (!res.ok) {
      setError(res.status === 403 ? "Not an admin account." : "Could not load designs.");
      return;
    }
    const data = await res.json();
    setReels(data.reels);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin/login";
    if (status === "authenticated") load();
  }, [status, load]);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Reels</h1>
          <p className="text-sm text-zinc-500">
            {reels ? `${reels.length} published designs` : "Loading…"}
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reels?.map((r) => <ReelCard key={r.id} reel={r} />)}
        </section>
      </div>
    </div>
  );
}

export default function ReelsPage() {
  return (
    <SessionProvider>
      <Reels />
    </SessionProvider>
  );
}
