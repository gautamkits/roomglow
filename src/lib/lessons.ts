import { getLessonsForEvent } from "@/lib/db";

/**
 * Append learned rules to an event brief.
 *
 * Server-only. `buildEventContext` runs on the client (SetupPanel builds the
 * brief before the photo is uploaded), so lessons cannot be injected there
 * without a DB call from the browser — the routes do it instead.
 *
 * SPACE SAFETY: a room redesign passes `eventContext === undefined`, and this
 * returns it untouched before it ever looks a rule up. A lesson therefore
 * cannot reach a space design by construction, the same guarantee
 * buildEventContext gives for the celebrationFor directive. Do not "improve"
 * this by defaulting eventContext to a string.
 *
 * Best-effort: any failure returns the original brief, which is the
 * known-good pre-lessons behaviour.
 */
export async function withLessons(
  eventContext: string | undefined,
  eventType?: string | null
): Promise<string | undefined> {
  if (!eventContext || !eventType) return eventContext;
  try {
    const rules = await getLessonsForEvent(eventType);
    if (!rules.length) return eventContext;
    // Numbered and fenced so the model reads them as hard constraints rather
    // than as more descriptive prose about the occasion.
    const block = rules.map((r, i) => `${i + 1}. ${r}`).join(" ");
    return `${eventContext} IMPORTANT — corrections learned from real user feedback on past ${eventType} designs, follow every one: ${block}`;
  } catch {
    return eventContext;
  }
}
