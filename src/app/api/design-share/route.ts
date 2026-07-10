import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import {
  getDesign,
  addDesignShare,
  removeDesignShare,
  listDesignShares,
} from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { sendDesignShareInvite } from "@/lib/email";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_SHARES_PER_DESIGN = 20;
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Only the design's owner (or an admin) may see or change its share list. */
async function authorize(designId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  }
  const design = await getDesign(designId);
  if (!design) {
    return { error: NextResponse.json({ error: "Design not found." }, { status: 404 }) };
  }
  const isOwner = !!design.user_id && design.user_id === session.user.id;
  if (!isOwner && !isAdminEmail(session.user.email)) {
    return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  }
  return { session, design };
}

export async function GET(request: Request) {
  const designId = new URL(request.url).searchParams.get("designId") || "";
  if (!designId) return NextResponse.json({ error: "Missing designId" }, { status: 400 });
  const { error } = await authorize(designId);
  if (error) return error;
  const shares = await listDesignShares(designId);
  return NextResponse.json({ shares });
}

export async function POST(request: Request) {
  const { designId, email } = await request.json().catch(() => ({}));
  if (!designId || !email) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }
  const normalized = String(email).trim().toLowerCase();
  if (!isEmail(normalized)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const res = await authorize(designId);
  if (res.error) return res.error;
  const { session } = res;

  // Anti-abuse: cap invites per user per hour and shares per design.
  if (!rateLimit(`design-share:${session.user!.id}`, 15, 60 * 60 * 1000).ok) {
    return NextResponse.json(
      { error: "You're sharing very quickly — please try again later." },
      { status: 429 }
    );
  }
  const existing = await listDesignShares(designId);
  if (existing.some((s) => s.email === normalized)) {
    return NextResponse.json({ shares: existing }); // already shared — idempotent
  }
  if (existing.length >= MAX_SHARES_PER_DESIGN) {
    return NextResponse.json(
      { error: `You can share a design with up to ${MAX_SHARES_PER_DESIGN} people.` },
      { status: 400 }
    );
  }

  await addDesignShare(designId, normalized);
  // Invite email is best-effort; the share itself already grants access.
  after(() =>
    sendDesignShareInvite({
      to: normalized,
      ownerName: session.user!.name || "Someone",
      designId,
    }).catch(() => {})
  );

  const shares = await listDesignShares(designId);
  return NextResponse.json({ shares });
}

export async function DELETE(request: Request) {
  const { designId, email } = await request.json().catch(() => ({}));
  if (!designId || !email) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }
  const { error } = await authorize(designId);
  if (error) return error;
  await removeDesignShare(designId, String(email));
  const shares = await listDesignShares(designId);
  return NextResponse.json({ shares });
}
