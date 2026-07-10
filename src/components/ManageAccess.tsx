"use client";

import { useEffect, useState } from "react";
import { Lock, Globe, UserPlus, X } from "lucide-react";

interface Share {
  email: string;
  created_at: string;
}

/** Owner-only panel to manage who can view a private design. */
export default function ManageAccess({
  designId,
  approved,
}: {
  designId: string;
  approved: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch(`/api/design-share?designId=${designId}`)
      .then((r) => r.json())
      .then((d) => setShares(d.shares || []))
      .catch(() => {});
  }, [open, designId]);

  const add = async () => {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/design-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, email: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Couldn't share right now.");
      } else {
        setShares(d.shares || []);
        setEmail("");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (target: string) => {
    const res = await fetch("/api/design-share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designId, email: target }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setShares(d.shares || []);
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300"
      >
        {approved ? (
          <>
            <Globe size={15} className="text-green-600 shrink-0" />
            <span className="font-medium">Public</span>
            <span className="text-zinc-400 text-xs">
              — anyone can view this design in the gallery
            </span>
          </>
        ) : (
          <>
            <Lock size={15} className="text-orange-700 shrink-0" />
            <span className="font-medium">Private</span>
            <span className="text-zinc-400 text-xs">
              — only you{shares.length > 0 ? ` and ${shares.length} other${shares.length === 1 ? "" : "s"}` : ""} can view
            </span>
            <span className="ml-auto text-xs text-orange-700 font-medium">
              {open ? "Close" : "Share with someone"}
            </span>
          </>
        )}
      </button>

      {open && !approved && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="friend@example.com"
              className="flex-1 px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700"
            />
            <button
              onClick={add}
              disabled={busy || !email.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-orange-700 px-3 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-50"
            >
              <UserPlus size={14} />
              {busy ? "Sharing…" : "Share"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <p className="text-xs text-zinc-400">
            They&apos;ll get an email invite and can view after signing in with
            that address. Only people you add can open this design.
          </p>
          {shares.length > 0 && (
            <ul className="space-y-1.5">
              {shares.map((s) => (
                <li
                  key={s.email}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <span className="truncate">{s.email}</span>
                  <button
                    onClick={() => remove(s.email)}
                    aria-label={`Remove ${s.email}`}
                    className="text-zinc-400 hover:text-red-600 p-1"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
