/**
 * Style: bold kinetic type. Ink background, each spoken word slams in on its
 * beat (timing spread across the line's measured speech segment), real designs
 * glow faintly behind, Noosho pops in from the edges.
 */
import {
  drawCover,
  clamp,
  lerp,
  easeOutBack,
  easeOutCubic,
  REEL_W as W,
  REEL_H as H,
  CLAY_LT,
  SORA,
  UI,
} from "@/lib/revealVideo";
import { drawNoosho, PROMO_LINES, type PromoAssets, type Timeline } from "../promo";
import type { MascotPose } from "@/components/Mascot";

const INK_BG = "#181410";
const CREAM = "#FAF6F0";
const ACCENT = /^(noosho|room\??|birthday…?|anniversary\??|ta-da!|real|buy!|shop|noosho\.com!?)$/i;

const EDGE: { side: "left" | "right" | "bottom"; pose: MascotPose }[] = [
  { side: "bottom", pose: "wave" },
  { side: "right", pose: "peek" },
  { side: "left", pose: "celebrate" },
  { side: "right", pose: "idea" },
  { side: "left", pose: "peek" },
  { side: "right", pose: "idea" },
  { side: "left", pose: "carry" },
  { side: "bottom", pose: "celebrate" },
  { side: "right", pose: "wave" },
  { side: "bottom", pose: "wave" },
];

export function renderKinetic(ctx: CanvasRenderingContext2D, t: number, a: PromoAssets, tl: Timeline) {
  ctx.fillStyle = INK_BG;
  ctx.fillRect(0, 0, W, H);

  // faint real designs behind the type, one per line, slow zoom
  const bgs = [a.after, ...a.cards.map((c) => c.img), ...a.gallery.map((g) => g.after)];
  // the current line: the last one whose start (minus a short lead) has passed
  let cur = 0;
  tl.lines.forEach(([ls], i) => { if (t >= ls - 0.4) cur = i; });
  const [s, e] = tl.lines[cur];
  ctx.save();
  ctx.globalAlpha = 0.16;
  drawCover(ctx, bgs[cur % bgs.length], 0, 0, W, H, 1.05 + 0.05 * clamp((t - s) / 3));
  ctx.restore();

  // words, one per row when long, slamming in on their beat
  const words = PROMO_LINES[cur].split(" ");
  const size = words.length > 6 ? 118 : words.length > 3 ? 138 : 170;
  ctx.font = `800 ${size}px ${SORA}`;
  ctx.textBaseline = "middle";
  // greedy wrap into rows
  const rows: string[][] = [[]];
  for (const w of words) {
    const test = [...rows[rows.length - 1], w].join(" ");
    if (ctx.measureText(test).width > 920 && rows[rows.length - 1].length) rows.push([w]);
    else rows[rows.length - 1].push(w);
  }
  const lh = size * 1.08;
  const top = H / 2 - 120 - ((rows.length - 1) * lh) / 2;
  // hold the last line to the end; earlier lines clear just after they're spoken
  const fadeOut = cur === 9 ? 1 : 1 - clamp((t - e - 0.15) / 0.2);
  let wi = 0;
  rows.forEach((row, r) => {
    const rowW = ctx.measureText(row.join(" ")).width;
    let x = W / 2 - rowW / 2;
    const y = top + r * lh;
    row.forEach((w) => {
      const at = s + ((e - s) * wi) / Math.max(1, words.length) - 0.04;
      const p = clamp((t - at) / 0.22);
      const k = easeOutBack(p);
      const ww = ctx.measureText(w).width;
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(p * 2) * fadeOut;
        ctx.translate(x + ww / 2, y);
        const sc = lerp(1.7, 1, k);
        ctx.scale(sc, sc);
        ctx.fillStyle = ACCENT.test(w) ? CLAY_LT : CREAM;
        ctx.textAlign = "center";
        ctx.fillText(w, 0, 0);
        ctx.restore();
      }
      x += ctx.measureText(w + " ").width;
      wi++;
    });
  });

  // Noosho pops in from an edge for each line
  const edge = EDGE[cur];
  const inP = easeOutBack(clamp((t - s + 0.2) / 0.35)) * fadeOut;
  const h = 520;
  if (edge.side === "bottom") {
    drawNoosho(ctx, a, edge.pose, W / 2, lerp(H + 200, H - 120, inP), h, { t, bob: 6 });
  } else if (edge.side === "left") {
    drawNoosho(ctx, a, edge.pose, lerp(-260, 150, inP), H - 180, h, { t, bob: 6, rot: 0.12 });
  } else {
    drawNoosho(ctx, a, edge.pose, lerp(W + 260, W - 150, inP), H - 180, h, { t, bob: 6, rot: -0.12, flip: true });
  }

  // final beat: url
  if (cur === 9) {
    const p = easeOutCubic(clamp((t - e) / 0.4));
    ctx.save();
    ctx.globalAlpha = p;
    ctx.font = `600 54px ${UI}`;
    ctx.fillStyle = CLAY_LT;
    ctx.textAlign = "center";
    ctx.fillText("noosho.com", W / 2, H / 2 + 260);
    ctx.restore();
  }
}
