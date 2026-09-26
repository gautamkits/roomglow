import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { recordImageGen } from "@/lib/db";
import {
  writeInputBrief,
  generateInputPhoto,
  type InputBriefRequest,
} from "@/lib/gemini";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
// Up to 4 brief+render pairs run in parallel; each is ~5–10s.
export const maxDuration = 120;

const MAX_COUNT = 4;
const MAX_TEXT = 1200;

const KINDS = ["room", "venue"] as const;
const STATES = ["empty", "lived-in", "cluttered"] as const;
const LIGHTS = ["daylight", "evening"] as const;

/**
 * Admin Input Studio: generate "before" photos to feed the normal design flow.
 *
 * Two modes:
 * - { kind, preset, state, light, extra?, count?, avoid? } — write `count`
 *   fresh scene briefs (cheap text call each), then render each one.
 * - { brief } — re-render an admin-edited brief directly, skipping the writer.
 *
 * Returns base64 only. Nothing is stored: the image exists until the admin
 * downloads it or hands it to /create.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = session!.user!.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // Build the list of briefs to render.
  let briefs: string[];
  if (typeof body.brief === "string" && body.brief.trim()) {
    briefs = [body.brief.trim().slice(0, MAX_TEXT)];
  } else {
    const kind = body.kind as InputBriefRequest["kind"];
    const state = body.state as InputBriefRequest["state"];
    const light = body.light as InputBriefRequest["light"];
    const preset = typeof body.preset === "string" ? body.preset.trim().slice(0, 120) : "";
    if (!KINDS.includes(kind) || !STATES.includes(state) || !LIGHTS.includes(light) || !preset) {
      return NextResponse.json({ error: "Missing or invalid options" }, { status: 400 });
    }
    const count = Math.min(MAX_COUNT, Math.max(1, Number(body.count) || 1));
    const extra = typeof body.extra === "string" ? body.extra.slice(0, 300) : undefined;
    const avoid = Array.isArray(body.avoid)
      ? body.avoid.filter((a): a is string => typeof a === "string").slice(-10).map((a) => a.slice(0, MAX_TEXT))
      : [];

    // Written in sequence, not parallel, so each brief can avoid the ones just
    // written in this same batch — otherwise 4 parallel calls converge.
    briefs = [];
    try {
      for (let i = 0; i < count; i++) {
        const b = await writeInputBrief({ kind, preset, state, light, extra, avoid: [...avoid, ...briefs] });
        briefs.push(b);
      }
    } catch (err) {
      console.error("[admin/input-image] brief failed:", err);
      return NextResponse.json({ error: "Could not write a scene description" }, { status: 502 });
    }
  }

  // Image calls are the billed part — check the admin cap per image.
  if (!rateLimit(`admin-input:${userId}`, 100, 60 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Hourly limit reached" }, { status: 429 });
  }

  const results = await Promise.all(
    briefs.map(async (brief) => {
      try {
        const img = await generateInputPhoto(brief);
        await recordImageGen("admin-input", userId);
        return { brief, imageBase64: img.data, mimeType: img.mimeType };
      } catch (err) {
        console.error("[admin/input-image] render failed:", err);
        return { brief, error: err instanceof Error ? err.message : "Render failed" };
      }
    })
  );

  return NextResponse.json({ results });
}
