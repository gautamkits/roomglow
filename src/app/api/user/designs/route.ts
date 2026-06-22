import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserDesigns, getUserEventDates } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [designs, eventDates] = await Promise.all([
      getUserDesigns(session.user.id),
      getUserEventDates(session.user.id),
    ]);

    return NextResponse.json({ designs, eventDates });
  } catch (error) {
    console.error("Get user designs failed:", error);
    return NextResponse.json({ error: "Failed to fetch designs" }, { status: 500 });
  }
}
