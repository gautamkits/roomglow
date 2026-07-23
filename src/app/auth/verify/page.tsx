"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SessionProvider, signIn } from "next-auth/react";

function Verify() {
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = params.get("token");
    const cb = params.get("cb") || "/create?resume=1";
    if (!token) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await signIn("email-link", { token, redirect: false });
        if (cancelled) return;
        if (res?.ok) {
          window.location.href = cb;
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        {failed ? (
          <>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              This sign-in link didn&apos;t work
            </h1>
            <p className="text-sm text-zinc-500 mb-6">
              It may have expired or already been used. Head back and request a
              fresh link.
            </p>
            <a
              href="/create"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800 transition-colors"
            >
              Back to Noosho
            </a>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-orange-700 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-zinc-500">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <SessionProvider>
      <Suspense fallback={null}>
        <Verify />
      </Suspense>
    </SessionProvider>
  );
}
