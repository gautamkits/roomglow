"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { User, Sparkles, LayoutGrid, ShieldCheck, LogOut } from "lucide-react";

interface MenuUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default function UserMenu({
  user,
  isAdmin = false,
}: {
  user?: MenuUser | null;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!user) {
    return (
      <button
        onClick={() => signIn("google")}
        className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
      >
        <User size={15} />
        Sign in
      </button>
    );
  }

  const initial = (user.name || user.email || "U").charAt(0).toUpperCase();

  const item =
    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-9 h-9 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:ring-2 hover:ring-orange-700/30 transition-all flex items-center justify-center bg-orange-50 dark:bg-orange-950/30"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-semibold text-orange-700">{initial}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1.5 z-50">
          <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 mb-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {user.name || "Signed in"}
            </p>
            {user.email && (
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            )}
          </div>

          <Link href="/create" className={item} onClick={() => setOpen(false)}>
            <Sparkles size={16} className="text-orange-700" />
            New design
          </Link>
          <Link href="/profile" className={item} onClick={() => setOpen(false)}>
            <LayoutGrid size={16} className="text-zinc-400" />
            My designs
          </Link>
          {isAdmin && (
            <Link href="/admin" className={item} onClick={() => setOpen(false)}>
              <ShieldCheck size={16} className="text-zinc-400" />
              Admin review
            </Link>
          )}

          <div className="border-t border-zinc-100 dark:border-zinc-800 my-1" />
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className={`${item} w-full text-left`}
          >
            <LogOut size={16} className="text-zinc-400" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
