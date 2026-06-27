"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { BarChart2, Users, Zap, TrendingUp, Heart, ArrowLeft } from "lucide-react";

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
