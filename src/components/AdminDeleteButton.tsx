"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

// Admin-only: remove a design from the public gallery straight from a card.
export default function AdminDeleteButton({ designId }: { designId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!confirm("Remove this design from the gallery?")) return;
    setBusy(true);
    try {
      await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, action: "reject" }),
      });
      router.refresh();
    } catch {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={remove}
      disabled={busy}
      aria-label="Remove from gallery"
      title="Remove from gallery"
      className="absolute top-2 right-2 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-900/70 text-white backdrop-blur-sm hover:bg-red-600 transition-colors disabled:opacity-50"
    >
      <Trash2 size={14} />
    </button>
  );
}
