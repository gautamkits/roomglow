"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Product analytics + session replay. Stays fully DORMANT (renders children
// untouched, loads no script) unless NEXT_PUBLIC_POSTHOG_KEY is set — so it
// adds zero weight until switched on in the environment. Inputs are masked, so
// we never record what users type (respects the "we never sell your data"
// promise); we still see the click/navigation path and where people drop off.
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!KEY || typeof window === "undefined") return;
    // Guard against re-init on client navigations / fast refresh.
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) return;
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: false, // captured manually below for the App Router
      capture_pageleave: true,
      persistence: "localStorage+cookie",
      session_recording: { maskAllInputs: true },
    });
  }, []);

  if (!KEY) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}

/** App Router doesn't fire a pageview on client navigations — do it manually. */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!pathname || !ph) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    ph.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}
