import Link from "next/link";
import { ArrowLeft, Wand2 } from "lucide-react";
import Footer from "./Footer";

export default function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-orange-700 flex items-center justify-center">
              <Wand2 size={14} className="text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              RoomGlow
            </span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={16} />
            Home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-5 py-12 w-full">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
          {title}
        </h1>
        {updated && (
          <p className="text-sm text-zinc-400 mb-8">Last updated {updated}</p>
        )}
        <div className="prose-roomglow space-y-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-100 [&_h2]:mt-8 [&_h2]:mb-2 [&_a]:text-orange-700 [&_a]:underline">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
