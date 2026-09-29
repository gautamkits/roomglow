/**
 * The "Noosho explains" script. Lines 1–3 are written fresh by Gemini from the
 * design's before/after photos, in the "blank canvas" style the founder picked
 * (2026-09-27); lines 4–5 are the fixed brand beat and CTA. Every model line is
 * validated and falls back on its own, so a bad answer never breaks a reel.
 * Server-only. Shared by the admin route and local preview renders.
 */
import { Type, type GoogleGenAI } from "@google/genai";

export type ScriptPhoto = { mimeType: string; data: string }; // base64

export type ScriptInput = {
  before: ScriptPhoto;
  after: ScriptPhoto;
  /** "space" (room) or "event" */
  mode?: string;
  roomType?: string;
  eventLabel?: string;
  subTheme?: string;
  narrative?: string;
  productNames?: string[];
  /** Lines from earlier takes — each Rewrite should say something new. */
  avoid?: string[];
};

/**
 * A fresh angle per call, so the same photo gets a different take each time
 * (temperature alone kept landing on near-identical lines).
 */
const ANGLES = [
  "Open with a curious question about the space or occasion.",
  "Point out ONE specific detail you can see in the BEFORE photo, with gentle humour.",
  "Be playfully dramatic, like a tiny excited friend — but kind.",
  "Notice something already nice in the BEFORE photo (the light, the window, the view) and build on it.",
  "Talk to the viewer directly, like you're sharing a secret.",
  "Make line 3 name the single biggest change you made, very concretely.",
];

export const FIXED_REAL = "And every piece is real — ready to shop!";
export const FIXED_CTA = "Let's design yours at noosho.com!";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Per-line fallbacks: the original shipped lines, or their event versions. */
function fallbacks(inp: ScriptInput): [string, string, string] {
  if (inp.mode === "event") {
    const ev = (inp.eventLabel || "Party").trim();
    return [`Hi frends! ${ev} coming up?`, "Just plain walls — a blank canvas, na?", "So I made it a party… ta-da!"];
  }
  return [
    `Hello frends! Look at this ${(inp.roomType || "room").toLowerCase()}…`,
    "So plain — like a blank canvas, na?",
    "So I gave it some love… ta-da!",
  ];
}

/** Keep a model line only if it follows the rules. */
function valid(line: unknown, max: number, extra?: (s: string) => boolean): line is string {
  if (typeof line !== "string") return false;
  const s = line.trim();
  if (!s || words(s) > max) return false;
  if (/\d/.test(s) || /[$₹]/.test(s)) return false; // prices live on screen only
  if (/\b(ugly|messy|dirty|disgusting|horrible|terrible|gross|shabby)\b/i.test(s)) return false;
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)) return false; // emoji
  return extra ? extra(s) : true;
}

export async function writeExplainLines(ai: GoogleGenAI, inp: ScriptInput): Promise<string[]> {
  const fb = fallbacks(inp);
  const what =
    inp.mode === "event"
      ? `an EVENT decoration: ${[inp.subTheme, inp.eventLabel].filter(Boolean).join(" ") || "a party"}. The BEFORE photo is the plain venue; the AFTER is it decorated.`
      : `a ROOM makeover of a ${inp.roomType || "room"}. The BEFORE photo is the room as it was; the AFTER is the redesign.`;

  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const avoid = (inp.avoid ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 12);
  let out: { line1?: string; line2?: string; line3?: string } = {};
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: "BEFORE photo:" },
            { inlineData: inp.before },
            { text: "AFTER photo:" },
            { inlineData: inp.after },
            {
              text: `You write the first three spoken lines of a short Instagram reel for Noosho — a tiny, bubbly, warm Indian cartoon designer who speaks light Indian English ("na?", "frends").
This reel is ${what}
${inp.narrative ? `Design notes: ${inp.narrative}` : ""}
${inp.productNames?.length ? `Pieces added: ${inp.productNames.slice(0, 6).join("; ")}` : ""}

Style — "blank canvas": Noosho greets, notices how plain the space was, then reveals what she did.
- line1: greeting + hook about THIS space or occasion. Start with "Hello frends!" or "Hi frends!". Max 9 words. Examples: "Hello frends! Look at this sleepy little hallway…", "Hi frends! Birthday coming up?"
- line2: one playful, KIND observation of the BEFORE photo, specific to what you actually see. Max 9 words. Examples: "One lonely bench and bare walls, na?", "Just plain walls — waiting for a party!"
- line3: what she did, specific to the AFTER photo, ending with "… ta-da!". Max 9 words. Examples: "So I added warm wood and soft light… ta-da!", "So I brought the balloons… ta-da!"

This take's angle: ${angle}
${avoid.length ? `Already used — do NOT reuse these lines or their key words/openings:\n- ${avoid.join("\n- ")}\n` : ""}
Rules: only mention things visible in the photos. Never insult the home (plain/sleepy/empty are fine; never ugly/messy/dirty). No numbers, no prices, no emojis. Make it feel fresh — don't just copy the examples.`,
            },
          ],
        },
      ],
      config: {
        temperature: 1.0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { line1: { type: Type.STRING }, line2: { type: Type.STRING }, line3: { type: Type.STRING } },
          required: ["line1", "line2", "line3"],
        },
      },
    });
    out = JSON.parse(res.text ?? "{}");
  } catch {
    /* model unavailable: all fallbacks */
  }

  const l1 = valid(out.line1, 9, (s) => /^(hello|hi)\s+frends/i.test(s)) ? out.line1.trim() : fb[0];
  const l2 = valid(out.line2, 9) ? out.line2.trim() : fb[1];
  // any "ta-da" ending counts ("Ta-da!!", "ta-da."), tidied to "ta-da!"
  const TADA = /\s*ta-?\s?da[!.…\s]*$/i;
  const l3 = valid(out.line3, 10, (s) => TADA.test(s)) ? out.line3.trim().replace(TADA, " ta-da!") : fb[2];
  return [l1, l2, l3, FIXED_REAL, FIXED_CTA];
}
