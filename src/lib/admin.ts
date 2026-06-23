export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/** Build descriptive alt text / titles for SEO from a design row. */
export function designAltText(d: {
  mode?: string;
  room_analysis?: Record<string, unknown> | string | null;
  event_config?: Record<string, unknown> | string | null;
  products?: unknown;
}): string {
  const ra = parseJsonish(d.room_analysis) as Record<string, string> | null;
  const ec = parseJsonish(d.event_config) as Record<string, string> | null;
  const prods = (parseJsonish(d.products) as Array<Record<string, unknown>>) || [];
  const names = prods
    .map((p) => {
      const rec = p.recommendation as Record<string, string> | undefined;
      return rec?.category;
    })
    .filter(Boolean)
    .slice(0, 3) as string[];

  if (d.mode === "event" && ec) {
    const base = `AI ${ec.subTheme || ""} ${ec.eventLabel || "event"} decoration`.trim();
    return names.length
      ? `${base} with ${names.join(", ")} — RoomGlow`
      : `${base} — RoomGlow`;
  }
  const style = ra?.currentStyle ? `${ra.currentStyle} ` : "";
  const room = ra?.roomType || "room";
  const base = `AI interior design of a ${style}${room}`.trim();
  return names.length
    ? `${base} with ${names.join(", ")} — RoomGlow`
    : `${base} — RoomGlow`;
}

export function designTitle(d: {
  mode?: string;
  room_analysis?: Record<string, unknown> | string | null;
  event_config?: Record<string, unknown> | string | null;
}): string {
  const ra = parseJsonish(d.room_analysis) as Record<string, string> | null;
  const ec = parseJsonish(d.event_config) as Record<string, string> | null;
  if (d.mode === "event" && ec) {
    return `${ec.subTheme ? ec.subTheme + " " : ""}${ec.eventLabel || "Event"} decoration`;
  }
  const style = ra?.currentStyle ? `${ra.currentStyle} ` : "";
  const room = ra?.roomType || "room";
  return `${style}${room} makeover`.replace(/^\w/, (c) => c.toUpperCase());
}

function parseJsonish(v: unknown) {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
}
