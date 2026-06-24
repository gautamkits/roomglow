"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import BeforeAfterSlider from "./BeforeAfterSlider";
import LikeButton from "./LikeButton";
import { designTitle } from "@/lib/admin";

interface GalleryItem {
  id: string;
  mode: string;
  event_config: Record<string, string> | null;
  room_analysis: Record<string, string> | null;
  original_image_url: string;
  generated_image_url: string;
  like_count: number;
}

export default function GalleryPreview() {
  const [items, setItems] = useState<GalleryItem[] | null>(null);

  useEffect(() => {
    fetch("/api/gallery?sort=top")
      .then((r) => r.json())
      .then((d) => setItems((d.designs || []).slice(0, 6)))
      .catch(() => setItems([]));
  }, []);

  // Hide entirely until there are published designs
  if (!items || items.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-5 py-12 w-full">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Real designs people made
          </h2>
          <p className="text-zinc-500 mt-1">
            Drag any photo to reveal the transformation. Tap to shop the look.
          </p>
        </div>
        <Link
          href="/explore"
          className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 hover:text-orange-800 transition-colors shrink-0"
        >
          Explore all
          <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((d) => (
          <article key={d.id} className="group">
            <BeforeAfterSlider
              beforeSrc={d.original_image_url}
              afterSrc={d.generated_image_url}
              beforeLabel="Before"
              afterLabel="Noosho"
            />
            <div className="flex items-center justify-between gap-3 mt-3">
              <Link
                href={`/design/${d.id}`}
                className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-orange-700 transition-colors line-clamp-1"
              >
                {designTitle(d)}
              </Link>
              <LikeButton designId={d.id} initialCount={d.like_count || 0} />
            </div>
          </article>
        ))}
      </div>

      <div className="text-center mt-8 sm:hidden">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-700"
        >
          Explore all designs
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
