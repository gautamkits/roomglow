/**
 * Regenerates EVENT-PROMPTS.md from the real event definitions.
 *
 * Hand-written docs about prompts rot immediately — CLAUDE.md still described
 * helper functions that had been deleted. This reads src/lib/events.ts and
 * renders the actual `buildEventContext` output per event, so the document is
 * always what the model really receives.
 *
 *   npm run docs:events
 */
import { writeFileSync } from "node:fs";
import { EVENTS, buildEventContext } from "../src/lib/events";

const rows: string[] = [];

rows.push("# Event prompts");
rows.push("");
rows.push(
  "**Generated file — do not edit by hand.** Run `npm run docs:events` after changing `src/lib/events.ts`."
);
rows.push("");
rows.push(
  "Every event runs through the same four AI steps. Only the *event brief* below differs per event — the pipeline prompts themselves are shared and live in `src/lib/gemini.ts`."
);
rows.push("");
rows.push("| Step | Function | What it does |");
rows.push("| --- | --- | --- |");
rows.push("| 1 | `analyzeRoom` | Reads the photo. Picks `venueKind`, a `stagingPlan` (indoor only), suggested items, and what is worth clearing. |");
rows.push("| 2 | `recommendProducts` | Turns chosen item types into categories, Amazon search queries and placements. |");
rows.push("| 3 | `curateProducts` | Picks one product per category so the set looks cohesive. |");
rows.push("| 4 | `generateDesignImage` | Renders the room with the products composited in. |");
rows.push("");
rows.push("## The event brief");
rows.push("");
rows.push(
  "Built by `buildEventContext()` in `src/lib/events.ts` and threaded into every step above. A string here vs `undefined` **is** the event-vs-space branch."
);
rows.push("");
rows.push("```");
rows.push(
  'This space will host a {promptLabel} with a "{subTheme}" theme using a {colorScheme} color scheme.{gender}{honoree} All signage and décor must match a {promptLabel} — never a different occasion, and never another country\'s version of the same-named holiday.'
);
rows.push("```");
rows.push("");
rows.push(
  "`promptLabel` overrides the user-facing `label` where the label is ambiguous across markets — e.g. \"Independence Day\" means different things in IN and US, and the label lands verbatim in the Amazon search query."
);
rows.push("");
rows.push("---");
rows.push("");
rows.push(`## Events (${EVENTS.length})`);
rows.push("");

for (const e of EVENTS) {
  const flags = [
    e.markets.join(" + "),
    e.promptLabel ? "has promptLabel" : null,
    e.gendered ? "gendered" : null,
    e.oneTime ? "one-time" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  rows.push(`### ${e.icon} ${e.label}`);
  rows.push("");
  rows.push(`\`${e.id}\` — ${flags}`);
  rows.push("");
  if (e.promptLabel) {
    rows.push(`**Sent to the model as:** ${e.promptLabel}`);
    rows.push("");
  }
  rows.push(`**Themes:** ${e.subThemes.join(", ")}`);
  rows.push("");
  rows.push(`**Colours:** ${e.colorSchemes.join(", ")}`);
  rows.push("");

  const example = buildEventContext({
    eventType: e.id,
    eventLabel: e.label,
    subTheme: e.subThemes[0],
    colorScheme: e.colorSchemes[0],
  });
  rows.push("**Example brief:**");
  rows.push("");
  rows.push("> " + example);
  rows.push("");

  const items = e.completionItems ?? [];
  if (items.length) {
    rows.push('**"Complete the occasion" searches** (shop grid only — never rendered into the design):');
    rows.push("");
    for (const it of items) rows.push(`- ${it.category} — \`${it.query}\``);
    rows.push("");
  }
  rows.push("---");
  rows.push("");
}

writeFileSync("EVENT-PROMPTS.md", rows.join("\n"));
console.log(`Wrote EVENT-PROMPTS.md — ${EVENTS.length} events`);
