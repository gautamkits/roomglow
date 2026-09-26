import Link from "next/link";
import type { Metadata } from "next";
import Mascot from "@/components/Mascot";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Page not found — noosho",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-stone-50 dark:bg-zinc-950">
      <Link href="/" className="mb-10" aria-label="noosho home">
        <Logo />
      </Link>
      <Mascot pose="peek" size={180} title="Noosho, searching" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Noosho looked everywhere&hellip;
      </h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">
        under the sofa, behind the curtains, even inside the parcel. This page isn&rsquo;t here.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-orange-700 hover:bg-orange-800"
        >
          Back home
        </Link>
        <Link
          href="/create"
          className="px-5 py-2.5 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
        >
          Design a room
        </Link>
      </div>
    </main>
  );
}
