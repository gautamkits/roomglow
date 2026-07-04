import type { Metadata, Viewport } from "next";
import { Geist, Sora } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Noosho - AI Interior Design",
  description:
    "Upload a photo of your room and get AI-powered product recommendations to transform your space",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Noosho",
  },
};

export const viewport: Viewport = {
  themeColor: "#bd6a43",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${sora.variable} h-full antialiased overflow-x-clip`} suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col font-[family-name:var(--font-geist-sans)] bg-stone-50 dark:bg-zinc-950 overflow-x-clip"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
