"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

export default function GallerySearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") || "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep in sync if navigated externally
  useEffect(() => {
    setValue(params.get("q") || "");
  }, [params]);

  const push = (q: string) => {
    const sp = new URLSearchParams(params.toString());
    if (q) sp.set("q", q);
    else sp.delete("q");
    router.replace(sp.toString() ? `/?${sp}` : "/");
  };

  const onChange = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(v), 350);
  };

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search designs, rooms, items…"
        className="w-full pl-9 pr-8 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors"
      />
      {value && (
        <button
          onClick={() => {
            setValue("");
            push("");
          }}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
