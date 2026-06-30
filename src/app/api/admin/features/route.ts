import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getFeatures, setFeature } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function guardAdmin() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) return null;
  return session;
}

export async function GET() {
  if (!(await guardAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const features = await getFeatures();
  return NextResponse.json(features);
}

export async function PUT(request: Request) {
  if (!(await guardAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { key, enabled } = await request.json();
  if (typeof key !== "string" || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  await setFeature(key, enabled);
  revalidatePath("/api/features");
  return NextResponse.json({ ok: true });
}
