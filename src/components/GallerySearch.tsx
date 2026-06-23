"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

export default function GallerySearch({ size = "sm" }: { size?: "sm" | "lg" }) {
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

  const lg = size === "lg";
  return (
    <div className={`relative w-full ${lg ? "" : "sm:max-w-xs"}`}>
      <Search
        size={lg ? 18 : 16}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search designs, rooms, items…"
        className={`w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-700/20 transition-colors ${
          lg ? "pl-10 pr-9 py-2.5 text-[15px]" : "pl-9 pr-8 py-2 text-sm"
        }`}
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
