"use client";

import { useCallback, useEffect, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import type { ReelItem } from "@/lib/reels";

// Daily-posting console for automation (Muse) and humans alike: every published
// design with a server-rendered reel MP4, its caption, and a posted log.

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`;
}

function ReelCard({ reel, onPosted }: { reel: ReelItem; onPosted: () => void }) {
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState(false);

  const markPosted = async () => {
    setMarking(true);
    await fetch(`/api/admin/reels/${reel.id}/posted`, { method: "POST" });
    setMarking(false);
    onPosted();
  };

  return (
    <div data-design-id={reel.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={reel.thumbnailUrl} alt={reel.title} className="w-full aspect-[4/3] object-cover" loading="lazy" />
      <div className="p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{reel.title}</h2>
          <p className="text-xs text-zinc-500">
            {reel.lastPostedAt ? `Posted ${daysAgo(reel.lastPostedAt)}` : "Never posted"}
          </p>
        </div>
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
          <button
            onClick={markPosted}
            disabled={marking}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 disabled:opacity-60"
          >
            {marking ? "Saving…" : "Mark as posted"}
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
  const [pick, setPick] = useState<ReelItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reels");
    if (!res.ok) {
      setError(res.status === 403 ? "Not an admin account." : "Could not load designs.");
      return;
    }
    const data = await res.json();
    setReels(data.reels);
    setPick((p) => (p ? data.reels.find((r: ReelItem) => r.id === p.id) ?? null : null));
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin/login";
    if (status === "authenticated") load();
  }, [status, load]);

  const pickRandom = async () => {
    const res = await fetch("/api/admin/reels?pick=random");
    if (res.ok) setPick((await res.json()).reel);
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Reels</h1>
            <p className="text-sm text-zinc-500">
              {reels ? `${reels.length} published designs` : "Loading…"} · random pick skips anything posted in the last 30 days
            </p>
          </div>
          <button
            onClick={pickRandom}
            className="px-4 py-2.5 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800"
          >
            Random design
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {pick && (
          <section id="random-pick" className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Today&apos;s pick</h2>
            <div className="max-w-sm">
              <ReelCard reel={pick} onPosted={load} />
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reels?.map((r) => <ReelCard key={r.id} reel={r} onPosted={load} />)}
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
