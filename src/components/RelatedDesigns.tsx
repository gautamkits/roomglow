import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { getGalleryCards } from "@/lib/db";
import { designTitle, designPrice, designRoomType, designEventType } from "@/lib/admin";

/** Same cached lightweight set the home gallery uses (refreshed on approve). */
const getCards = unstable_cache(() => getGalleryCards({ sort: "top", limit: 200 }), ["gallery-cards", "top"], {
  tags: ["gallery"],
  revalidate: 300,
});

type Card = Awaited<ReturnType<typeof getGalleryCards>>[number];

/**
 * "You may also like" under a design: same occasion (or room type) first, then
 * the same mode, most-liked first. Only approved designs ever appear.
 */
export default async function RelatedDesigns({ design }: { design: Card }) {
  const cards = await getCards().catch(() => [] as Card[]);
  const label = design.mode === "event" ? designEventType(design) : designRoomType(design);
  const key = (d: Card) => (d.mode === "event" ? designEventType(d) : designRoomType(d));
  const score = (d: Card) => (label && key(d) === label ? 2 : 0) + (d.mode === design.mode ? 1 : 0);
  const related = cards
    .filter((d) => d.id !== design.id && score(d) > 0)
    .map((d, i) => ({ d, s: score(d), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 8)
    .map((x) => x.d);
  if (related.length === 0) return null;

  return (
    <section className="bg-stone-50 dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto px-4 pb-12">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">You may also like</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {related.map((d) => {
            const price = designPrice(d);
            return (
              <Link
                key={d.id}
                href={`/design/${d.id}`}
                className="group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-orange-200 dark:hover:border-orange-900/50 transition-colors"
              >
                <div className="relative aspect-[4/5]">
                  <Image
                    src={d.generated_image_url}
                    alt={designTitle(d)}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                    placeholder={d.generated_blur ? "blur" : "empty"}
                    blurDataURL={d.generated_blur || undefined}
                  />
                </div>
                <div className="px-2.5 py-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-orange-700 transition-colors line-clamp-2">
                    {designTitle(d)}
                  </span>
                  {price && <span className="block mt-0.5 text-[11px] text-zinc-500">{price}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
