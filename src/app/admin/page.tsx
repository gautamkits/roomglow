"use client";

import { useEffect, useState, useCallback } from "react";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Check, X, BarChart2, Tag, Sparkles, Gift } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import RevealExport, { type RevealDesign } from "@/components/RevealExport";

interface PendingDesign {
  id: string;
  mode: string;
  design_narrative: string;
  original_image_url: string;
  generated_image_url: string;
}

type ApprovedDesign = RevealDesign & {
  generated_image_url: string;
  original_image_url: string;
};

interface StoredEventConfig {
  eventLabel?: string;
  subTheme?: string;
  colorScheme?: string;
  honoree?: string;
}

interface AllDesign {
  id: string;
  mode: string;
  design_narrative: string;
  original_image_url: string;
  generated_image_url: string;
  created_at: string;
  is_unlocked: boolean;
  gallery_status: string;
  user_email: string | null;
  user_id: string | null;
  event_config: StoredEventConfig | null;
}

const ALL_PAGE = 60;

/**
 * Regenerate a design for the user who owns it and email it to them, either
 * free (unlocked on arrival) or locked at the normal price. Event designs get
 * theme/colour/name overrides — without them, re-rolling just repeats the same
 * brief and relies on luck.
 */
function RegenerateSend({ design }: { design: AllDesign }) {
  const cfg = design.event_config || {};
  const isEvent = design.mode === "event";
  const [open, setOpen] = useState(false);
  const [subTheme, setSubTheme] = useState(cfg.subTheme || "");
  const [colorScheme, setColorScheme] = useState(cfg.colorScheme || "");
  const [honoree, setHonoree] = useState(cfg.honoree || "");
  const [note, setNote] = useState("");
  const [free, setFree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/regenerate-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: design.id,
          free,
          note,
          overrides: isEvent ? { subTheme, colorScheme, honoree } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to regenerate.");
      } else {
        setResult(
          `Sent to ${data.sentTo} — ${data.productCount} products, ${
            data.free ? "free" : "locked"
          }.`
        );
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  };

  if (!design.user_email) {
    return (
      <p className="text-[11px] text-zinc-400 mt-2">
        Anonymous design — no one to send to.
      </p>
    );
  }

  const field =
    "w-full px-2 py-1.5 rounded-md text-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700";

  return (
    <div className="mt-2 border-t border-zinc-100 dark:border-zinc-800 pt-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-[11px] font-medium text-orange-700 hover:text-orange-800"
        >
          Regenerate &amp; send…
        </button>
      ) : (
        <div className="space-y-2">
          {isEvent && (
            <div className="grid grid-cols-2 gap-1.5">
              <input className={field} value={subTheme} onChange={(e) => setSubTheme(e.target.value)} placeholder="Theme" />
              <input className={field} value={colorScheme} onChange={(e) => setColorScheme(e.target.value)} placeholder="Colours" />
              <input className={`${field} col-span-2`} value={honoree} onChange={(e) => setHonoree(e.target.value)} placeholder="Name" />
            </div>
          )}
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Personal note in the email (optional)" />
          <div className="flex items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={free} onChange={() => setFree(true)} />
              <span className="text-zinc-700 dark:text-zinc-300">Free (unlocked)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={!free} onChange={() => setFree(false)} />
              <span className="text-zinc-700 dark:text-zinc-300">Paid (locked)</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={send}
              disabled={busy}
              className="px-3 py-1.5 rounded-md bg-orange-700 hover:bg-orange-800 text-white text-[11px] font-medium disabled:opacity-50"
            >
              {busy ? "Generating…" : `Generate & email ${design.user_email}`}
            </button>
            {!busy && (
              <button onClick={() => setOpen(false)} className="text-[11px] text-zinc-500 hover:text-zinc-700">
                Cancel
              </button>
            )}
          </div>
          {busy && (
            <p className="text-[11px] text-zinc-500">
              Sourcing products and rendering — this takes a minute or two.
            </p>
          )}
          {result && <p className="text-[11px] text-green-700 dark:text-green-400">{result}</p>}
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

const ADMIN_TABS = [
  { key: "pending", label: "Pending review" },
  { key: "published", label: "Published" },
  { key: "all", label: "All designs" },
] as const;

function AdminContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "published" | "all">("pending");
  const [designs, setDesigns] = useState<PendingDesign[]>([]);
  const [approved, setApproved] = useState<ApprovedDesign[]>([]);
  const [all, setAll] = useState<AllDesign[]>([]);
  const [allHasMore, setAllHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [makeoverEnabled, setMakeoverEnabled] = useState(false);
  const [featureLoading, setFeatureLoading] = useState(false);
  const [firstFreeEnabled, setFirstFreeEnabled] = useState(false);
  const [promoSignups, setPromoSignups] = useState(0);
  const [promoCap, setPromoCap] = useState(500);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/pending");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setDesigns(data.designs || []);
    setLoading(false);
  }, []);

  const loadApproved = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/approved");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setApproved(data.designs || []);
    setLoading(false);
  }, []);

  const loadAll = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    const res = await fetch(`/api/admin/all-designs?limit=${ALL_PAGE}&offset=${offset}`);
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const data = await res.json();
    const batch: AllDesign[] = data.designs || [];
    setAll((prev) => (offset === 0 ? batch : [...prev, ...batch]));
    setAllHasMore(batch.length === ALL_PAGE);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    fetch("/api/admin/features")
      .then((r) => r.json())
      .then((d) => {
        setMakeoverEnabled(!!d.makeover);
        setFirstFreeEnabled(!!d.first_design_free);
        setPromoSignups(d.promoSignups ?? 0);
        setPromoCap(d.promoCap ?? 500);
      })
      .catch(() => {});
  }, []);

  const toggleFeature = async (
    key: string,
    current: boolean,
    set: (v: boolean) => void
  ) => {
    setFeatureLoading(true);
    const next = !current;
    set(next);
    await fetch("/api/admin/features", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled: next }),
    }).catch(() => set(!next));
    setFeatureLoading(false);
  };

  const toggleMakeover = () => toggleFeature("makeover", makeoverEnabled, setMakeoverEnabled);
  const toggleFirstFree = () =>
    toggleFeature("first_design_free", firstFreeEnabled, setFirstFreeEnabled);

  useEffect(() => {
    if (status === "unauthenticated") signIn("google");
    if (status !== "authenticated") return;
    if (tab === "pending") load();
    else if (tab === "published") loadApproved();
    else loadAll(0);
  }, [status, tab, load, loadApproved, loadAll]);

  const review = async (id: string, action: "approve" | "reject") => {
    setDesigns((d) => d.filter((x) => x.id !== id));
    await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designId: id, action }),
    });
  };

  // Remove a published design from the public home-page gallery.
  const removeFromGallery = async (id: string) => {
    if (!confirm("Remove this design from the home page gallery?")) return;
    setApproved((d) => d.filter((x) => x.id !== id));
    await fetch("/api/admin/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designId: id, action: "reject" }),
    });
  };

  if (status === "loading" || (loading && !forbidden)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-zinc-950">
        <div className="w-8 h-8 border-2 border-orange-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-zinc-950 gap-3">
        <p className="text-zinc-600 dark:text-zinc-300">You don&apos;t have access to this page.</p>
        <button onClick={() => router.push("/")} className="text-orange-700 text-sm">
          Go home
        </button>
      </div>
    );
  }

  // Rendered twice — inside the header on >=sm, and in the mobile row below it.
  const tabGroup = (className: string) => (
    <div
      className={`items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 text-sm ${className}`}
    >
      {ADMIN_TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-md transition-colors ${
            tab === t.key
              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
              : "text-zinc-500"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <SiteHeader
        user={session?.user}
        isAdmin={session?.user?.isAdmin}
        showDesignCta={false}
        rightExtra={
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/admin/pricing")}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <Tag size={14} />
              <span className="hidden sm:inline">Pricing</span>
            </button>
            <button
              onClick={() => router.push("/admin/analytics")}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <BarChart2 size={14} />
              <span className="hidden sm:inline">Analytics</span>
            </button>
          </div>
        }
        center={tabGroup("hidden sm:flex")}
      />

      {/* Mobile tab row — the header can't fit these next to the logo, locale
          switcher, Pricing/Analytics buttons and avatar, so they move below it
          (same pattern as the gallery search on the home page). */}
      <div className="sm:hidden border-b border-zinc-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 px-5 py-2.5 overflow-x-auto">
        {tabGroup("flex w-max")}
      </div>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {/* Features */}
        <div className="mb-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Features</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-orange-700" />
              <div>
                <p className="text-sm text-zinc-800 dark:text-zinc-200">Personal Makeover</p>
                <p className="text-xs text-zinc-500">AI fashion stylist + virtual try-on (3rd mode)</p>
              </div>
            </div>
            <button
              onClick={toggleMakeover}
              disabled={featureLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                makeoverEnabled ? "bg-orange-700" : "bg-zinc-300 dark:bg-zinc-700"
              } ${featureLoading ? "opacity-50" : ""}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  makeoverEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Gift size={15} className="text-orange-700" />
              <div>
                <p className="text-sm text-zinc-800 dark:text-zinc-200">First design free</p>
                <p className="text-xs text-zinc-500">
                  Next {promoCap} signups get 1 free design · {promoSignups} of {promoCap} signups so far
                </p>
              </div>
            </div>
            <button
              onClick={toggleFirstFree}
              disabled={featureLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                firstFreeEnabled ? "bg-orange-700" : "bg-zinc-300 dark:bg-zinc-700"
              } ${featureLoading ? "opacity-50" : ""}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  firstFreeEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {tab === "pending" &&
          (designs.length === 0 ? (
            <p className="text-center text-zinc-500 py-20">Nothing pending review.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {designs.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
                >
                  <div className="grid grid-cols-2">
                    <img src={d.original_image_url} alt="Before" className="w-full aspect-square object-cover" />
                    <img src={d.generated_image_url} alt="After" className="w-full aspect-square object-cover" />
                  </div>
                  <div className="p-4">
                    <span className="text-[11px] uppercase tracking-wide text-zinc-400">
                      {d.mode}
                    </span>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 line-clamp-2 mt-1 mb-3">
                      {d.design_narrative}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => review(d.id, "approve")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium transition-colors"
                      >
                        <Check size={15} /> Approve
                      </button>
                      <button
                        onClick={() => review(d.id, "reject")}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-medium hover:border-zinc-300 transition-colors"
                      >
                        <X size={15} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {tab === "published" &&
          (approved.length === 0 ? (
            <p className="text-center text-zinc-500 py-20">No published designs yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {approved.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
                >
                  <div className="grid grid-cols-2">
                    <img src={d.original_image_url} alt="Before" className="w-full aspect-square object-cover" />
                    <img src={d.generated_image_url} alt="After" className="w-full aspect-square object-cover" />
                  </div>
                  <div className="p-4">
                    <RevealExport design={d} />
                    <button
                      onClick={() => removeFromGallery(d.id)}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <X size={15} /> Remove from home page
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {tab === "all" &&
          (all.length === 0 ? (
            <p className="text-center text-zinc-500 py-20">No designs yet.</p>
          ) : (
            <>
              <p className="text-xs text-zinc-500 mb-4">
                Every generated design (private too) — for reviewing outputs to
                refine prompts. Click any card to open it.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
                {all.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
                  >
                    <a href={`/design/${d.id}`} target="_blank" rel="noreferrer" className="block">
                      <div className="grid grid-cols-2">
                        <img src={d.original_image_url} alt="Before" className="w-full aspect-square object-cover" />
                        <img src={d.generated_image_url} alt="After" className="w-full aspect-square object-cover" />
                      </div>
                    </a>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-zinc-400">
                          {d.mode}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            d.gallery_status === "approved"
                              ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                              : d.gallery_status === "pending"
                              ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          {d.gallery_status === "approved"
                            ? "public"
                            : d.gallery_status === "pending"
                            ? "pending"
                            : "private"}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate mt-1">
                        {d.user_email || "anonymous"}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {new Date(d.created_at).toLocaleString()}
                      </p>
                      <RegenerateSend design={d} />
                    </div>
                  </div>
                ))}
              </div>
              {allHasMore && (
                <div className="text-center mt-8">
                  <button
                    onClick={() => loadAll(all.length)}
                    disabled={loadingMore}
                    className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          ))}
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <SessionProvider>
      <AdminContent />
    </SessionProvider>
  );
}
