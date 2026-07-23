"use client";

import { useState } from "react";
import { Mail, Check } from "lucide-react";

/**
 * Passwordless email sign-in. Posts to /api/auth/magic/request, which emails a
 * one-time link. Offered alongside Google because Google OAuth is blocked in the
 * Instagram in-app browser (our main ad channel) — this path works everywhere.
 */
export default function EmailSignIn({
  callbackUrl = "/create?resume=1",
}: {
  callbackUrl?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/auth/magic/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, callbackUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setState("sent");
      } else {
        setError(data.error || "Couldn't send the link. Please try again.");
        setState("error");
      }
    } catch {
      setError("Couldn't send the link. Please try again.");
      setState("error");
    }
  };

  if (state === "sent") {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20 p-4 text-center">
        <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-2">
          <Check size={18} className="text-green-700 dark:text-green-400" />
        </div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Check your inbox
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          We sent a sign-in link to <span className="font-medium">{email}</span>.
          It expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 text-left">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Mail
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
          />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={state === "sending"}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : "Email me a link"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
