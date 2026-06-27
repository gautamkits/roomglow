"use client";

import { useEffect, useState, useCallback } from "react";
import { SessionProvider, useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Check, X, BarChart2, Tag } from "lucide-react";
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

function AdminContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "published">("pending");
  const [designs, setDesigns] = useState<PendingDesign[]>([]);
  const [approved, setApproved] = useState<ApprovedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

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

  useEffect(() => {
    if (status === "unauthenticated") signIn("google");
    if (status !== "authenticated") return;
    if (tab === "pending") load();
    else loadApproved();
  }, [status, tab, load, loadApproved]);

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
        center={
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 text-sm">
            <button
              onClick={() => setTab("pending")}
              className={`px-3 py-1 rounded-md transition-colors ${
                tab === "pending"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              Pending review
            </button>
            <button
              onClick={() => setTab("published")}
              className={`px-3 py-1 rounded-md transition-colors ${
                tab === "published"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              Published
            </button>
          </div>
        }
      />

      <main className="max-w-5xl mx-auto px-5 py-8">
        {tab === "pending" ? (
          designs.length === 0 ? (
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
          )
        ) : approved.length === 0 ? (
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
        )}
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
