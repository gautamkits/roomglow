import Link from "next/link";
import { Wand2 } from "lucide-react";

const LINKS = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Refunds", href: "/refund" },
];

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-20">
      <div className="max-w-5xl mx-auto px-5 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-orange-700 flex items-center justify-center">
              <Wand2 size={14} className="text-white" />
            </span>
            <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Noosho
            </span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-xs text-zinc-400 mt-8">
          © {new Date().getFullYear()} Noosho. AI-generated designs are
          suggestions for inspiration. Product prices and availability are set
          by Amazon. As an Amazon Associate we earn from qualifying purchases.
        </p>
      </div>
    </footer>
  );
}
