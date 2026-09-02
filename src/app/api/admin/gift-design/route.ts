import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign, giftDesign, getUserById } from "@/lib/db";
import { sendGiftDesignEmail, notifyAdminError } from "@/lib/email";
import { onDesignUnlocked } from "@/lib/unlock";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await auth();
    const adminEmail = session?.user?.email;
    if (!isAdminEmail(adminEmail)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { designId, note } = (await request.json()) as {
      designId?: string;
      note?: string;
    };
    if (
      !designId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(designId)
    ) {
      return NextResponse.json({ error: "Bad design id" }, { status: 400 });
    }

    const design = await getDesign(designId);
    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }
    // A gift needs somebody to give it to. Anonymous designs have no owner and
    // no address, so unlocking one would just be a silent state change.
    if (!design.user_id) {
      return NextResponse.json(
        { error: "This design has no owner to gift it to." },
        { status: 400 }
      );
    }
    const owner = await getUserById(design.user_id);
    if (!owner?.email) {
      return NextResponse.json(
        { error: "Owner has no email on file." },
        { status: 400 }
      );
    }

    const res = await giftDesign({ designId, adminEmail: adminEmail! });
    if (!res.ok) {
      return NextResponse.json({ error: "Could not gift design" }, { status: 500 });
    }
    if (res.alreadyUnlocked) {
      // Don't tell someone they've been given what they already had.
      return NextResponse.json({ ok: true, alreadyUnlocked: true, sentTo: null });
    }

    // Locked designs defer hotspot detection to save the AI cost, so the pins
    // do not exist yet. Fill them now the design is entitled to be viewed —
    // otherwise the gift opens to a design with no shoppable pins.
    onDesignUnlocked(designId);

    const cfg = design.event_config
      ? typeof design.event_config === "string"
        ? JSON.parse(design.event_config)
        : design.event_config
      : null;

    after(async () => {
      await sendGiftDesignEmail({
        to: owner.email!,
        name: owner.name,
        designId,
        generatedImageUrl: design.generated_image_url,
        eventLabel: cfg?.eventLabel ?? null,
        note: note?.trim() || null,
      });
    });

    return NextResponse.json({ ok: true, sentTo: owner.email });
  } catch (error) {
    console.error("Gift design failed:", error);
    await notifyAdminError({ route: "admin/gift-design", error });
    return NextResponse.json({ error: "Failed to gift design" }, { status: 500 });
  }
}
