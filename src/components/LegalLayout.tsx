import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import SiteHeader from "./SiteHeader";
import Footer from "./Footer";

export default async function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex flex-col">
      <SiteHeader
        user={session?.user}
        isAdmin={isAdminEmail(session?.user?.email)}
      />

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
