export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

type DesignLike = {
  mode?: string;
  room_analysis?: Record<string, unknown> | string | null;
  event_config?: Record<string, unknown> | string | null;
  products?: unknown;
  selected_items?: unknown;
};

/** Clean human labels of the items in a design — prefers the user's selected
 *  item labels (e.g. "Abstract Wall Art"), falls back to product categories. */
export function designItems(d: DesignLike): string[] {
  const sel = parseJsonish(d.selected_items) as string[] | null;
  if (Array.isArray(sel) && sel.length) {
    return [...new Set(sel.map((s) => String(s).trim()).filter(Boolean))];
  }
  const prods = (parseJsonish(d.products) as Array<Record<string, unknown>>) || [];
  const names = prods
    .map((p) => {
      const rec = p.recommendation as Record<string, string> | undefined;
      const ap = p.amazonProduct as Record<string, string> | undefined;
      return rec?.category || ap?.title;
    })
    .filter(Boolean) as string[];
  return [...new Set(names.map((n) => n.trim()))];
}

/** Build descriptive alt text for SEO from a design row. */
export function designAltText(d: DesignLike): string {
  const ra = parseJsonish(d.room_analysis) as Record<string, string> | null;
  const ec = parseJsonish(d.event_config) as Record<string, string> | null;
  const names = designItems(d).slice(0, 6);

  if (d.mode === "event" && ec) {
    const base = `AI ${ec.subTheme || ""} ${ec.eventLabel || "event"} decoration`.trim();
    return names.length
      ? `${base} featuring ${names.join(", ")} — designed with RoomGlow`
      : `${base} — designed with RoomGlow`;
  }
  const style = ra?.currentStyle ? `${ra.currentStyle} ` : "";
  const room = ra?.roomType || "room";
  const base = `AI interior design of a ${style}${room}`.trim();
  return names.length
    ? `${base} featuring ${names.join(", ")} — designed with RoomGlow`
    : `${base} — designed with RoomGlow`;
}

/** SEO meta description: room/style/event + the actual items in the design. */
export function designDescription(d: DesignLike & { design_narrative?: string }): string {
  const items = designItems(d);
  const itemsPhrase = items.length
    ? ` Includes ${items.slice(0, 8).join(", ")}.`
    : "";
  const narrative = (d.design_narrative || "").trim();
  const lead = narrative
    ? narrative
    : `${designTitle(d)} — an AI-generated design you can shop, made from one photo with RoomGlow.`;
  return `${lead}${itemsPhrase}`.slice(0, 300);
}

/** SEO keywords from room/style/event + items. */
export function designKeywords(d: DesignLike): string[] {
  const ra = parseJsonish(d.room_analysis) as Record<string, string> | null;
  const ec = parseJsonish(d.event_config) as Record<string, string> | null;
  const kws = new Set<string>(["AI interior design", "room makeover", "shop the look"]);
  if (d.mode === "event" && ec) {
    if (ec.eventLabel) kws.add(`${ec.eventLabel} decoration`);
    if (ec.subTheme) kws.add(`${ec.subTheme} ${ec.eventLabel || "party"} theme`);
  } else {
    if (ra?.roomType) kws.add(`${ra.roomType} design`);
    if (ra?.currentStyle) kws.add(`${ra.currentStyle} ${ra?.roomType || "room"}`);
  }
  for (const it of designItems(d)) kws.add(it.toLowerCase());
  return [...kws];
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
