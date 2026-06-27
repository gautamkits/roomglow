import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getUserReport } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const users = await getUserReport();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("User report failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
