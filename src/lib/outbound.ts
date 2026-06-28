// Single chokepoint for outbound affiliate links. Every affiliate URL rendered
// in the app must go through this so clicks pass through the /api/go redirect
// (302, noindex, nofollow) instead of exposing tagged amazon.* URLs to crawlers.
// New features just call outboundHref — the SEO policy is global by construction.
export function outboundHref(url: string): string {
  return `/api/go?u=${encodeURIComponent(url)}`;
}
