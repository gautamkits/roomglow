"use client";

import { useState } from "react";
import { SessionProvider, signIn } from "next-auth/react";

// Username/password sign-in for automation agents that can't do Google OAuth.
// Humans should keep using Google from /admin.
function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const res = await signIn("admin-password", { username, password, redirect: false });
    if (res?.ok && !res.error) {
      window.location.href = "/admin";
    } else {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Admin sign-in</h1>
        <input
          name="username"
          autoComplete="username"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        />
        {error && <p className="text-sm text-red-600">Invalid username or password.</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full px-5 py-2.5 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <SessionProvider>
      <AdminLogin />
    </SessionProvider>
  );
}
