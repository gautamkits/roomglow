"use client";

import { useEffect } from "react";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowLeft, Plus } from "lucide-react";
import { useUserLibrary } from "@/lib/useUserLibrary";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import DesignGrid from "@/components/dashboard/DesignGrid";

function ProfileContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") signIn("google");
  }, [status]);

  const { designs, eventDates, loading } = useUserLibrary(
    status === "authenticated"
  );

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Home</span>
          </button>
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            RoomGlow
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {session?.user && (
          <div className="flex items-center gap-4 mb-8">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt=""
                className="w-14 h-14 rounded-full border border-zinc-200 dark:border-zinc-800"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center text-orange-700 font-semibold text-lg">
                {session.user.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {session.user.name}
              </h1>
              <p className="text-sm text-zinc-500 truncate">{session.user.email}</p>
            </div>
          </div>
        )}

        {eventDates.length > 0 && (
          <div className="mb-10">
            <UpcomingEvents eventDates={eventDates} />
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">
            Your designs
          </h2>
          {designs.length > 0 && (
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-sm text-orange-700 hover:text-orange-800 font-medium transition-colors"
            >
              <Plus size={15} />
              New design
            </button>
          )}
        </div>

        {designs.length === 0 ? (
          <div className="text-center py-20 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
            <Sparkles size={32} className="text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 mb-1">No designs yet</p>
            <p className="text-sm text-zinc-400 mb-5">
              Upload a room photo and let our AI design it for you.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-5 py-2.5 text-sm bg-orange-700 text-white rounded-lg hover:bg-orange-800 transition-colors font-medium"
            >
              Create your first design
            </button>
          </div>
        ) : (
          <DesignGrid designs={designs} />
        )}
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <SessionProvider>
      <ProfileContent />
    </SessionProvider>
  );
}
