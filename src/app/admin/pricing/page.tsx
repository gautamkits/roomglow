"use client";

import { useEffect, useState, useCallback } from "react";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Tag, Trash2, Plus } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";

interface PricingRow {
  locale: string;
  actual_amount: number;
  sale_amount: number;
  currency: string;
}

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  locale: string | null;
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
}

const major = (amount: number, currency: string) =>
  currency === "usd" ? (amount / 100).toFixed(2) : String(Math.round(amount / 100));
const symbol = (currency: string) => (currency === "usd" ? "$" : "₹");

function PricingContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Draft pricing edits keyed by locale
  const [draft, setDraft] = useState<Record<string, { actual: string; sale: string }>>({});

  // New coupon form
  const [form, setForm] = useState({
    code: "",
    discountType: "percent",
    discountValue: "",
    locale: "",
    maxUses: "",
    expiresAt: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/pricing");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setPricing(data.pricing || []);
    setCoupons(data.coupons || []);
    const d: Record<string, { actual: string; sale: string }> = {};
    (data.pricing || []).forEach((p: PricingRow) => {
      d[p.locale] = {
        actual: major(p.actual_amount, p.currency),
        sale: major(p.sale_amount, p.currency),
      };
    });
    setDraft(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") signIn("google");
    if (status === "authenticated") load();
  }, [status, load]);

  const savePricing = async (p: PricingRow) => {
    const edit = draft[p.locale];
    if (!edit) return;
    const actualAmount = Math.round(parseFloat(edit.actual) * 100);
    const saleAmount = Math.round(parseFloat(edit.sale) * 100);
    const res = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: p.locale, actualAmount, saleAmount }),
    });
    if (res.ok) {
      setSavedMsg(`${p.locale} pricing saved`);
      setTimeout(() => setSavedMsg(null), 2000);
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      setSavedMsg(e.error || "Save failed");
      setTimeout(() => setSavedMsg(null), 3000);
    }
  };

  const createCoupon = async () => {
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        discountType: form.discountType,
        // fixed discounts are entered in major units → convert to smallest
        discountValue:
          form.discountType === "fixed"
            ? Math.round(parseFloat(form.discountValue) * 100)
            : Math.round(parseFloat(form.discountValue)),
        locale: form.locale || null,
        maxUses: form.maxUses || null,
        expiresAt: form.expiresAt || null,
      }),
    });
    if (res.ok) {
      setForm({ code: "", discountType: "percent", discountValue: "", locale: "", maxUses: "", expiresAt: "" });
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      alert(e.error || "Failed to create coupon");
    }
  };

  const toggleCoupon = async (c: Coupon) => {
    await fetch(`/api/admin/coupons/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    load();
  };

  const removeCoupon = async (c: Coupon) => {
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    await fetch(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
    load();
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

  const couponDiscountLabel = (c: Coupon) =>
    c.discount_type === "percent"
      ? `${c.discount_value}% off`
      : `${symbol(c.locale === "US" ? "usd" : "inr")}${major(c.discount_value, c.locale === "US" ? "usd" : "inr")} off`;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <SiteHeader user={session?.user} isAdmin={session?.user?.isAdmin} showDesignCta={false} />
      <main className="max-w-3xl mx-auto px-5 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/admin")}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Pricing & Coupons
          </h1>
          {savedMsg && <span className="text-sm text-green-600">{savedMsg}</span>}
        </div>

        {/* Pricing */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Pricing</h2>
          <div className="space-y-3">
            {pricing.map((p) => (
              <div
                key={p.locale}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-wrap items-end gap-4"
              >
                <div className="font-semibold text-zinc-900 dark:text-zinc-50 w-10">
                  {p.locale === "US" ? "🇺🇸" : "🇮🇳"}
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-zinc-400 mb-1">
                    Actual price ({symbol(p.currency)})
                  </label>
                  <input
                    value={draft[p.locale]?.actual ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [p.locale]: { ...d[p.locale], actual: e.target.value } }))
                    }
                    className="w-28 px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-zinc-400 mb-1">
                    Sale price ({symbol(p.currency)})
                  </label>
                  <input
                    value={draft[p.locale]?.sale ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [p.locale]: { ...d[p.locale], sale: e.target.value } }))
                    }
                    className="w-28 px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700"
                  />
                </div>
                <button
                  onClick={() => savePricing(p)}
                  className="px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium transition-colors"
                >
                  Save
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            Actual price shows struck-through; customers pay the sale price (minus any coupon).
          </p>
        </section>

        {/* Coupons */}
        <section>
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Coupons</h2>

          {/* Create form */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="CODE"
                className="px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700 uppercase"
              />
              <select
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                className="px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700"
              >
                <option value="percent">% off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
              <input
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                placeholder={form.discountType === "percent" ? "e.g. 20" : "e.g. 2.00"}
                className="px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700"
              />
              <select
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                className="px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700"
              >
                <option value="">All regions</option>
                <option value="IN">🇮🇳 India</option>
                <option value="US">🇺🇸 USA</option>
              </select>
              <input
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                placeholder="Max uses (optional)"
                className="px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700"
              />
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700"
              />
            </div>
            <button
              onClick={createCoupon}
              disabled={!form.code.trim() || !form.discountValue}
              className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Plus size={15} />
              Create coupon
            </button>
            <p className="text-xs text-zinc-400 mt-2">
              Fixed-amount discounts are entered in the region&apos;s currency (e.g. 2.00 = $2.00 / ₹2).
            </p>
          </div>

          {/* List */}
          {coupons.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">No coupons yet.</p>
          ) : (
            <div className="space-y-2">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center gap-3"
                >
                  <Tag size={15} className={c.active ? "text-orange-700" : "text-zinc-300"} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">{c.code}</span>
                      <span className="text-xs text-zinc-500">{couponDiscountLabel(c)}</span>
                      {c.locale && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          {c.locale}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Used {c.used_count}
                      {c.max_uses ? ` / ${c.max_uses}` : ""}
                      {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCoupon(c)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      c.active
                        ? "border-green-300 text-green-700 dark:border-green-900 dark:text-green-400"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-400"
                    }`}
                  >
                    {c.active ? "Active" : "Inactive"}
                  </button>
                  <button
                    onClick={() => removeCoupon(c)}
                    className="text-zinc-400 hover:text-red-600 transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function PricingPage() {
  return (
    <SessionProvider>
      <PricingContent />
    </SessionProvider>
  );
}
