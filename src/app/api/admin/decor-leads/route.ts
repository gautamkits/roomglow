import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { listDecorLeads } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const leads = await listDecorLeads();
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("Decor leads report failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
