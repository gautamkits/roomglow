"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  created_at: string;
  designs: string;
  unlocked: string;
  spent: string;
  currency: string | null;
  last_active: string | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(minor: number, currency: string | null) {
  if (!minor) return "—";
  const cur = (currency || "usd").toUpperCase();
  try {
    return (minor / 100).toLocaleString(undefined, { style: "currency", currency: cur });
  } catch {
    return `${cur} ${(minor / 100).toFixed(2)}`;
  }
}

function UsersContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "paying" | "free">("all");

  useEffect(() => {
    if (status === "unauthenticated") signIn("google");
    if (status !== "authenticated") return;
    fetch("/api/admin/users")
      .then((res) => {
        if (res.status === 403) {
          setForbidden(true);
          return null;
        }
        return res.json();
      })
      .then((d) => {
        if (d) setUsers(d.users || []);
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

  const all = users || [];
  const payingCount = all.filter((u) => Number(u.spent) > 0).length;
  const q = query.trim().toLowerCase();
  const rows = all.filter((u) => {
    if (filter === "paying" && Number(u.spent) <= 0) return false;
    if (filter === "free" && Number(u.spent) > 0) return false;
    if (q && !`${u.name || ""} ${u.email}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const filters: { id: typeof filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "paying", label: "Paying" },
    { id: "free", label: "Free" },
  ];

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
            Users
          </h1>
          <span className="ml-auto text-sm text-zinc-500">
            {rows.length === all.length
              ? `${all.length} users · ${payingCount} paying`
              : `${rows.length} of ${all.length}`}
          </span>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
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
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 shrink-0">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  filter === f.id
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Designs</th>
                <th className="px-4 py-3 font-medium text-right">Unlocked</th>
                <th className="px-4 py-3 font-medium text-right">Spent</th>
                <th className="px-4 py-3 font-medium">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {u.name || "—"}
                    </div>
                    <div className="text-xs text-zinc-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                    {fmtDate(u.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                    {u.designs}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                    {u.unlocked}
                  </td>
                  <td
                    className={`px-4 py-3 text-right whitespace-nowrap ${
                      Number(u.spent) > 0
                        ? "font-medium text-green-700 dark:text-green-400"
                        : "text-zinc-400"
                    }`}
                  >
                    {fmtMoney(Number(u.spent), u.currency)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                    {fmtDate(u.last_active)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                    {all.length === 0 ? "No users yet." : "No users match."}
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

export default function UsersPage() {
  return (
    <SessionProvider>
      <UsersContent />
    </SessionProvider>
  );
}
