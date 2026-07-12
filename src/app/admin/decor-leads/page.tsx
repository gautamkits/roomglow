"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { formatAmount } from "@/lib/locale";

interface LeadRow {
  id: string;
  design_id: string | null;
  event_label: string | null;
  email: string;
  phone: string | null;
  event_date: string | null;
  city: string | null;
  locale: string | null;
  quoted_price_minor: string | null;
  currency: string | null;
  duration_label: string | null;
  user_id: string | null;
  created_at: string;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function LeadsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") signIn("google");
    if (status !== "authenticated") return;
    fetch("/api/admin/decor-leads")
      .then((res) => {
        if (res.status === 403) {
          setForbidden(true);
          return null;
        }
        return res.json();
      })
      .then((d) => {
        if (d) setLeads(d.leads || []);
      })
      .finally(() => setLoading(false));
  }, [status]);

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
        <button onClick={() => router.push("/")} className="text-orange-700 text-sm">
          Go home
        </button>
      </div>
    );
  }

  const all = leads || [];
  const q = query.trim().toLowerCase();
  const rows = all.filter((l) => {
    if (!q) return true;
    return `${l.email} ${l.phone || ""} ${l.event_label || ""} ${l.city || ""}`
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <SiteHeader user={session?.user} isAdmin={session?.user?.isAdmin} showDesignCta={false} />
      <main className="max-w-6xl mx-auto px-5 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/admin/analytics")}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Decorator waitlist
          </h1>
          <span className="ml-auto text-sm text-zinc-500">
            {rows.length === all.length
              ? `${all.length} leads`
              : `${rows.length} of ${all.length}`}
          </span>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email, phone, event or city…"
            className="w-full pl-9 pr-8 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Event date</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium text-right">Quoted</th>
                <th className="px-4 py-3 font-medium">Design</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">{l.email}</div>
                    <div className="text-xs text-zinc-400">{l.phone || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {l.event_label || "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                    {l.event_date || "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{l.city || "—"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                    {l.quoted_price_minor
                      ? formatAmount(Number(l.quoted_price_minor), l.currency || "inr")
                      : "—"}
                    {l.duration_label ? (
                      <span className="text-xs text-zinc-400"> · {l.duration_label}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {l.design_id ? (
                      <a
                        href={`/design/${l.design_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-700 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                    {fmtDate(l.created_at)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                    {all.length === 0 ? "No waitlist leads yet." : "No leads match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default function DecorLeadsPage() {
  return (
    <SessionProvider>
      <LeadsContent />
    </SessionProvider>
  );
}
