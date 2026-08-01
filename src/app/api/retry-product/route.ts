import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchProductsDetailed, amazonSearchUrl } from "@/lib/amazon";
import { localeFromRequest } from "@/lib/locale";
import { rateLimit } from "@/lib/rateLimit";

// Re-source a single product row after a transient Amazon outage left it empty.
// Deliberately skips curation: this is a repair path for one already-approved
// category, so the top relevance-ranked candidate is the right answer and we
// don't spend a Gemini vision call on it.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }

  const { category, searchQuery } = (await request.json()) as {
    category?: string;
    searchQuery?: string;
  };
  const query = (searchQuery || category || "").trim();
  if (!query) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }

  if (!rateLimit(`retry-product:${session.user.id}`, 30, 60 * 60 * 1000).ok) {
    return NextResponse.json(
      { error: "Too many retries. Please try again later." },
      { status: 429 }
    );
  }

  const locale = localeFromRequest(request);
  let outcome = await searchProductsDetailed(query, 1, locale);
  if (outcome.status === "no_results" && category && category !== query) {
    outcome = await searchProductsDetailed(category, 1, locale);
  }

  return NextResponse.json({
    product: outcome.results[0] ?? null,
    status: outcome.results.length ? "ok" : outcome.status,
    searchUrl: amazonSearchUrl(query, locale),
  });
}
