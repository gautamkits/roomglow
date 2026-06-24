"use client";

import Link from "next/link";
import { Wand2, Sparkles } from "lucide-react";
import UserMenu from "./UserMenu";

interface MenuUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default function SiteHeader({
  user,
  isAdmin = false,
  center,
  rightExtra,
  showDesignCta = true,
}: {
  user?: MenuUser | null;
  isAdmin?: boolean;
  center?: React.ReactNode;
  rightExtra?: React.ReactNode;
  showDesignCta?: boolean;
}) {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-6 h-6 rounded-md bg-orange-700 flex items-center justify-center">
            <Wand2 size={14} className="text-white" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            RoomGlow
          </span>
        </Link>

        {center ? <div className="flex-1 min-w-0">{center}</div> : <div className="flex-1" />}

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {rightExtra}
          {showDesignCta && (
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white font-medium transition-colors"
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline">Design your own</span>
              <span className="sm:hidden">Design</span>
            </Link>
          )}
          <UserMenu user={user} isAdmin={isAdmin} />
        </div>
      </div>
    </header>
  );
}
