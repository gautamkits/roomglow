import type { RoomAnalysis } from "./types";

// Things the analyzer lists in existingFurniture that aren't furniture. A photo
// of just a wall still comes back with "wall" (sometimes floor/ceiling too), so
// these can't count as evidence that the space is furnished.
const NON_FURNITURE =
  /^(bare |blank |empty |plain |feature )?(wall|walls|floor|flooring|ceiling|window|windows|door|doors|corner|room|space|surface)s?$/i;

/**
 * True when the photo is essentially a blank wall rather than a furnished room.
 *
 * Deliberately conservative — anything resembling real furniture makes this
 * false. The two branches carry very different risk. Treating a bare wall as
 * furnished only yields a more restrained design. Treating a furnished room as
 * a bare wall lets the renderer recompose the scene to build its backdrop,
 * which moves the user's sofa and deletes their windows. So we only claim
 * "bare wall" when there is no furniture at all.
 */
export function isBareWall(analysis?: RoomAnalysis | null): boolean {
  if (!analysis) return false;
  const items = analysis.existingFurniture ?? [];
  const real = items.filter((f) => f && !NON_FURNITURE.test(String(f).trim()));
  return real.length === 0;
}
