import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import {
  listLessons,
  createLesson,
  setLessonActive,
  deleteLesson,
  MAX_LESSON_CHARS,
} from "@/lib/db";

/**
 * Learned design rules. Admin-only — these go straight into the generation
 * prompt for every future design of their scope, so this is a privileged
 * surface, not a content endpoint.
 */
export async function GET() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ lessons: await listLessons() });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { scopeType, scopeValue, rule, sourceFeedbackId } = (await request.json()) as {
    scopeType?: string;
    scopeValue?: string;
    rule?: string;
    sourceFeedbackId?: number;
  };
  // v1 is event-scoped only: buildEventContext is the one injection point proven
  // unable to reach a space redesign. Widening this needs its own verification.
  if (scopeType !== "event" || !scopeValue || !rule?.trim()) {
    return NextResponse.json({ error: "Event-scoped rules only" }, { status: 400 });
  }
  if (rule.trim().length > MAX_LESSON_CHARS) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_LESSON_CHARS} characters` },
      { status: 400 }
    );
  }
  const res = await createLesson({ scopeType, scopeValue, rule, sourceFeedbackId });
  return res.ok
    ? NextResponse.json({ id: res.id })
    : NextResponse.json({ error: res.error || "Failed" }, { status: 500 });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, active } = (await request.json()) as { id?: number; active?: boolean };
  if (!id || typeof active !== "boolean") {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }
  const res = await setLessonActive(id, active);
  return res.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: res.error || "Failed" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = (await request.json()) as { id?: number };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteLesson(id);
  return NextResponse.json({ ok: true });
}
