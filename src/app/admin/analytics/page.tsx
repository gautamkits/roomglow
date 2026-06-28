"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { BarChart2, Users, Zap, TrendingUp, Heart, ArrowLeft, Cpu } from "lucide-react";

interface AnalyticsData {
  totals: {
    total_designs: string;
    space_designs: string;
    event_designs: string;
    unlocked_designs: string;
    designs_7d: string;
    designs_30d: string;
  };
  funnel: {
    pending: string;
    approved: string;
    rejected: string;
    total_likes: string;
  };
  revenue: {
    total_paise: string;
    paid_count: string;
    paid_30d: string;
  };
  revenueByCurrency: { currency: string; total: string; cnt: string }[];
  roomTypes: { room_type: string; cnt: string }[];
  signups: {
    total_users: string;
    users_7d: string;
    users_30d: string;
  };
  imageGen: {
    daily: { day: string; total: string; design: string; restyle: string; empty: string }[];
    totals: { total: string; calls_7d: string; calls_30d: string; empty_30d: string };
  };
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20" : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent ? "bg-orange-700" : "bg-zinc-100 dark:bg-zinc-800"}`}>
          <span className={accent ? "text-white" : "text-zinc-500 dark:text-zinc-400"}>{icon}</span>
        </span>
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{value}</div>
      {sub && <div className="text-xs text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
}

function AnalyticsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Tunable ₹ rate per image-gen call (gemini-3.1-flash-image). Defaults to a
  // rough ₹12; admin can adjust to match real billing. Excludes the cheap
  // gemini-2.5-flash text/vision calls (~₹1-2/design total).
  const [ratePerGen, setRatePerGen] = useState(12);

  const load = () =>
    fetch("/api/admin/analytics")
      .then((res) => {
        if (res.status === 403) { setForbidden(true); return null; }
        return res.json();
      })
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));

  useEffect(() => {
    if (status === "unauthenticated") signIn("google");
    if (status !== "authenticated") return;
    load();
  }, [status]);

  const syncStripe = async () => {
    setSyncing(true);
    try {
      await fetch("/api/admin/backfill-stripe", { method: "POST" });
      await load();
    } finally {
      setSyncing(false);
    }
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
        <p className="text-zinc-600 dark:text-zinc-300">Access denied.</p>
        <button onClick={() => router.push("/")} className="text-orange-700 text-sm">Go home</button>
      </div>
    );
  }

  if (!data) return null;

  const totalDesigns = Number(data.totals.total_designs);
  const unlockedPct = totalDesigns > 0
    ? Math.round((Number(data.totals.unlocked_designs) / totalDesigns) * 100)
    : 0;
  const approvedTotal =
    Number(data.funnel.pending) + Number(data.funnel.approved) + Number(data.funnel.rejected);
  const approvalRate = approvedTotal > 0
    ? Math.round((Number(data.funnel.approved) / approvedTotal) * 100)
    : 0;
  const fmtMoney = (minor: number, currency: string) => {
    try {
      return (minor / 100).toLocaleString(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: 2,
      });
    } catch {
      return `${currency.toUpperCase()} ${(minor / 100).toFixed(2)}`;
    }
  };
  const byCurrency = data.revenueByCurrency || [];
  const revenueDisplay =
    byCurrency.length === 0
      ? fmtMoney(0, "usd")
      : byCurrency.map((r) => fmtMoney(Number(r.total), r.currency)).join(" · ");

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <SiteHeader
        user={session?.user}
        isAdmin={session?.user?.isAdmin}
        showDesignCta={false}
      />
      <main className="max-w-5xl mx-auto px-5 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/admin")}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Analytics</h1>
          <button
            onClick={() => router.push("/admin/users")}
            className="ml-auto text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 transition-colors"
          >
            Users report
          </button>
          <button
            onClick={syncStripe}
            disabled={syncing}
            className="text-sm px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 transition-colors disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync Stripe sales"}
          </button>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Zap size={14} />}
            label="Total designs"
            value={data.totals.total_designs}
            sub={`${data.totals.designs_7d} this week · ${data.totals.designs_30d} this month`}
            accent
          />
          <StatCard
            icon={<Users size={14} />}
            label="Users"
            value={data.signups.total_users}
            sub={`+${data.signups.users_7d} this week`}
          />
          <StatCard
            icon={<TrendingUp size={14} />}
            label="Revenue"
            value={revenueDisplay}
            sub={`${data.revenue.paid_count} paid · ${data.revenue.paid_30d} in 30d`}
          />
          <StatCard
            icon={<Heart size={14} />}
            label="Total likes"
            value={data.funnel.total_likes}
            sub={`${data.funnel.approved} published designs`}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {/* Mode split */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={15} className="text-zinc-400" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Design mode split</span>
            </div>
            <div className="space-y-3">
              {[
                { label: "Interior (space)", value: Number(data.totals.space_designs), color: "bg-orange-700" },
                { label: "Event décor", value: Number(data.totals.event_designs), color: "bg-zinc-400" },
              ].map((item) => {
                const pct = totalDesigns > 0 ? Math.round((item.value / totalDesigns) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs text-zinc-500 mb-1">
                      <span>{item.label}</span>
                      <span>{item.value} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Funnel */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} className="text-zinc-400" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Conversion funnel</span>
            </div>
            <div className="space-y-3">
              {[
                { label: "Generated", value: totalDesigns, pct: 100 },
                { label: "Unlocked (paid)", value: Number(data.totals.unlocked_designs), pct: unlockedPct },
                { label: "Submitted to gallery", value: approvedTotal, pct: totalDesigns > 0 ? Math.round(approvedTotal / totalDesigns * 100) : 0 },
                { label: "Approved & published", value: Number(data.funnel.approved), pct: approvalRate },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs text-zinc-500 mb-1">
                    <span>{item.label}</span>
                    <span>{item.value} ({item.pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full bg-orange-700" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Image-generation calls (billed AI usage) */}
        {data.imageGen && (() => {
          const ig = data.imageGen;
          const daily = ig.daily || [];
          const maxDay = Math.max(1, ...daily.map((d) => Number(d.total)));
          const designs30d = Number(data.totals.designs_30d) || 0;
          const calls30d = Number(ig.totals?.calls_30d) || 0;
          // How many billed gens it takes to produce one saved design (waste signal).
          const callsPerDesign = designs30d > 0 ? (calls30d / designs30d).toFixed(1) : "—";
          const inr = (n: number) =>
            `₹${Math.round(n).toLocaleString("en-IN")}`;
          const cost30d = calls30d * ratePerGen;
          return (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Cpu size={15} className="text-zinc-400" />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Image-gen calls (billed AI usage)
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-3">
                Every billed image generation — including failed, retried, and abandoned ones that never save a design.
              </p>

              <div className="flex items-center gap-2 mb-4 text-xs text-zinc-500">
                <label htmlFor="rate">Est. ₹ per image-gen call:</label>
                <span className="text-zinc-400">₹</span>
                <input
                  id="rate"
                  type="number"
                  min={0}
                  step={0.5}
                  value={ratePerGen}
                  onChange={(e) => setRatePerGen(Math.max(0, Number(e.target.value) || 0))}
                  className="w-20 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 tabular-nums"
                />
                <span className="text-zinc-400">— excludes minor text/vision calls (~₹1–2/design)</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{ig.totals?.calls_30d ?? 0}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Calls (30d)</div>
                </div>
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{designs30d}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Saved designs (30d)</div>
                </div>
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{callsPerDesign}×</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Calls per saved design</div>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 px-3 py-2.5">
                  <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{inr(cost30d)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Est. cost (30d) · {ig.totals?.empty_30d ?? 0} empty</div>
                </div>
              </div>

              {daily.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-[11px] text-zinc-400 mb-1">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-700 inline-block" />Design</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" />Restyle</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-zinc-400 inline-block" />Empty-room</span>
                    <span className="ml-auto">calls · est. ₹</span>
                  </div>
                  {daily.map((d) => {
                    const total = Number(d.total);
                    const design = Number(d.design);
                    const restyle = Number(d.restyle);
                    const empty = Number(d.empty);
                    const w = (n: number) => `${(n / maxDay) * 100}%`;
                    return (
                      <div key={d.day} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-20 shrink-0 tabular-nums">{d.day.slice(5)}</span>
                        <div className="flex-1 h-4 rounded bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex">
                          <div className="h-full bg-orange-700" style={{ width: w(design) }} />
                          <div className="h-full bg-orange-400" style={{ width: w(restyle) }} />
                          <div className="h-full bg-zinc-400" style={{ width: w(empty) }} />
                        </div>
                        <span className="text-xs text-zinc-500 w-8 text-right tabular-nums">{total}</span>
                        <span className="text-xs text-zinc-400 w-16 text-right tabular-nums">{inr(total * ratePerGen)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">No image-gen calls recorded yet — data starts accumulating from now.</p>
              )}
            </div>
          );
        })()}

        {/* Top room types */}
        {data.roomTypes.length > 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={15} className="text-zinc-400" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Top room types</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.roomTypes.map((rt) => (
                <div key={rt.room_type} className="rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-center">
                  <div className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{rt.cnt}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 capitalize">{rt.room_type || "Unknown"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <SessionProvider>
      <AnalyticsContent />
    </SessionProvider>
  );
}
