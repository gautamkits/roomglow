"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { savePendingUpload } from "@/lib/flowPersistence";

// Admin Input Studio: generate "before" photos to feed the normal design flow,
// so the admin doesn't have to hunt for usable room/venue photos. Output is 9:16,
// and because generateDesignImage pins its output to the input's aspect, the
// resulting design is 9:16 too — it fills a reel frame with no letterbox bars.
//
// These are AI-generated rooms, not customer homes. Fine for demos and gallery
// seeding; don't caption them as a real person's space.

type Kind = "room" | "venue";
type State = "empty" | "lived-in" | "cluttered";
type Light = "daylight" | "evening";

const PRESETS: Record<Kind, string[]> = {
  room: [
    "Indian 2BHK living room",
    "Indian apartment master bedroom",
    "Indian apartment balcony",
    "Pooja corner in an Indian home",
    "Indian modular kitchen",
    "Kids bedroom in an Indian flat",
    "Home entrance / foyer in an Indian flat",
    "Rooftop terrace in India",
    "Indian villa living room",
    "US suburban living room",
    "US apartment bedroom",
    "US backyard patio",
  ],
  venue: [
    "Small banquet hall in India",
    "Society community hall in India",
    "Indian home living room cleared for a party",
    "Indian apartment terrace for an evening function",
    "Restaurant private dining room",
    "US backyard for a party",
    "US living room for a birthday party",
  ],
};

type Result = {
  id: string;
  /** Kind this was generated as — decides whether "Use in noosho" applies. */
  kind: Kind;
  brief: string;
  imageBase64?: string;
  mimeType?: string;
  error?: string;
  busy?: boolean;
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Same shape the ImageUpload path produces: longest side ≤1024, JPEG 0.85. */
function toUploadDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("No canvas"));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

function Studio() {
  const { status } = useSession();
  const [kind, setKind] = useState<Kind>("room");
  const [preset, setPreset] = useState(PRESETS.room[0]);
  const [state, setState] = useState<State>("empty");
  const [light, setLight] = useState<Light>("daylight");
  const [extra, setExtra] = useState("");
  const [count, setCount] = useState(2);
  const [results, setResults] = useState<Result[]>([]);
  const [recentBriefs, setRecentBriefs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin/login";
  }, [status]);

  const dataUrl = (r: Result) => `data:${r.mimeType || "image/png"};base64,${r.imageBase64}`;

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/input-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 403) throw new Error("Not an admin account.");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json.results as Omit<Result, "id" | "kind">[];
  }

  async function generate(opts?: { surprise?: boolean }) {
    setLoading(true);
    setError(null);
    let k = kind, p = preset, s = state, l = light;
    if (opts?.surprise) {
      k = pick(["room", "venue"] as const);
      p = pick(PRESETS[k]);
      s = pick(["empty", "empty", "lived-in", "cluttered"] as const);
      l = pick(["daylight", "daylight", "evening"] as const);
      setKind(k); setPreset(p); setState(s); setLight(l);
    }
    try {
      const out = await call({ kind: k, preset: p, state: s, light: l, extra, count, avoid: recentBriefs });
      const withIds = out.map((r) => ({ ...r, id: crypto.randomUUID(), kind: k }));
      setResults((prev) => [...withIds, ...prev]);
      setRecentBriefs((prev) => [...prev, ...out.map((r) => r.brief)].slice(-10));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function rerender(id: string, brief: string) {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, busy: true, error: undefined } : r)));
    try {
      const [out] = await call({ brief });
      setResults((prev) => prev.map((r) => (r.id === id ? { ...out, id, kind: r.kind, busy: false } : r)));
    } catch (e) {
      setResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, busy: false, error: e instanceof Error ? e.message : "Failed" } : r))
      );
    }
  }

  async function sendToCreate(r: Result) {
    const base64 = await toUploadDataUrl(dataUrl(r));
    // Replays through the sign-in resume path, which starts the room flow
    // directly with this photo. Venues need the event setup form, so they
    // are download-only (see below).
    await savePendingUpload({
      base64,
      mode: "space",
      eventConfig: null,
      makeoverConfig: null,
      noBudget: false,
    });
    window.location.href = "/create?resume=1";
  }

  const inputCls =
    "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm";

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Input Studio</h1>
          <p className="text-sm text-zinc-500">
            Generate 9:16 &ldquo;before&rdquo; photos to design from. Each click writes a new scene, so
            results vary. AI-generated rooms — don&rsquo;t caption them as a real customer&rsquo;s home.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-zinc-500 space-y-1">
            <span>Kind</span>
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => {
                const k = e.target.value as Kind;
                setKind(k);
                setPreset(PRESETS[k][0]);
              }}
            >
              <option value="room">Room</option>
              <option value="venue">Event venue</option>
            </select>
          </label>
          <label className="text-xs text-zinc-500 space-y-1">
            <span>Space</span>
            <select className={inputCls} value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS[kind].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500 space-y-1">
            <span>Condition</span>
            <select className={inputCls} value={state} onChange={(e) => setState(e.target.value as State)}>
              <option value="empty">Empty (best before/after)</option>
              <option value="lived-in">Lightly lived-in</option>
              <option value="cluttered">Cluttered</option>
            </select>
          </label>
          <label className="text-xs text-zinc-500 space-y-1">
            <span>Light</span>
            <select className={inputCls} value={light} onChange={(e) => setLight(e.target.value as Light)}>
              <option value="daylight">Daylight</option>
              <option value="evening">Evening, lights on</option>
            </select>
          </label>
          <label className="text-xs text-zinc-500 space-y-1">
            <span>Variants</span>
            <select className={inputCls} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-500 space-y-1">
            <span>Must include (optional)</span>
            <input
              className={inputCls}
              value={extra}
              maxLength={300}
              placeholder="e.g. marble floor, big window on the left"
              onChange={(e) => setExtra(e.target.value)}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2 pt-1">
            <button
              disabled={loading}
              onClick={() => generate()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-orange-700 hover:bg-orange-800 disabled:opacity-50"
            >
              {loading ? "Generating…" : `Generate ${count}`}
            </button>
            <button
              disabled={loading}
              onClick={() => generate({ surprise: true })}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
            >
              Surprise me
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r) => (
            <ResultCard
              key={r.id}
              r={r}
              src={r.imageBase64 ? dataUrl(r) : null}
              canUse={r.kind === "room"}
              onRerender={(brief) => rerender(r.id, brief)}
              onUse={() => sendToCreate(r)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function ResultCard({
  r,
  src,
  canUse,
  onRerender,
  onUse,
}: {
  r: Result;
  src: string | null;
  canUse: boolean;
  onRerender: (brief: string) => void;
  onUse: () => void;
}) {
  const [brief, setBrief] = useState(r.brief);
  useEffect(() => setBrief(r.brief), [r.brief]);

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="aspect-[9/16] bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
        {r.busy ? (
          <span className="text-xs text-zinc-400">Rendering…</span>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Generated input" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-red-500 px-4 text-center">{r.error || "No image"}</span>
        )}
      </div>
      <div className="p-3 space-y-2">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          className="w-full text-[11px] leading-snug rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent p-2 text-zinc-600 dark:text-zinc-300"
        />
        <div className="flex flex-wrap gap-2">
          {src && (
            <a
              href={src}
              download={`noosho-input-${r.id.slice(0, 8)}.png`}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-orange-700 hover:bg-orange-800"
            >
              Download
            </a>
          )}
          {src && canUse && (
            <button
              onClick={onUse}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-orange-700 text-orange-700"
            >
              Use in noosho
            </button>
          )}
          <button
            disabled={r.busy}
            onClick={() => onRerender(brief)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          >
            Re-render this brief
          </button>
        </div>
        {!canUse && src && (
          <p className="text-[10px] text-zinc-400">Venues: download, then upload via Event mode.</p>
        )}
      </div>
    </div>
  );
}

export default function InputStudioPage() {
  return (
    <SessionProvider>
      <Studio />
    </SessionProvider>
  );
}
