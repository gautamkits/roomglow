"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-4 text-sm text-green-800 dark:text-green-300">
        Thanks — your message is on its way. We typically reply within 1–2
        business days.
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-700 focus:ring-1 focus:ring-orange-700";

  return (
    <form onSubmit={onSubmit} className="not-prose space-y-4 max-w-md">
      <div>
        <label htmlFor="cf-name" className="block text-sm font-medium mb-1">
          Name
        </label>
        <input
          id="cf-name"
          type="text"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="cf-email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="cf-email"
          type="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="cf-message" className="block text-sm font-medium mb-1">
          Message
        </label>
        <textarea
          id="cf-message"
          required
          maxLength={5000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Honeypot: hidden from users, catches bots. Off-screen, not display:none,
          and aria-hidden + tabindex -1 so it's out of the tab/AT flow. */}
      <div aria-hidden className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="cf-website">Leave this field empty</label>
        <input
          id="cf-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
