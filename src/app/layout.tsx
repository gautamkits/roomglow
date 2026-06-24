import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col font-[family-name:var(--font-geist-sans)] bg-stone-50 dark:bg-zinc-950"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
