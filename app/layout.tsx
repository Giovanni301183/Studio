import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Studio — Storie di Scuola",
  description: "Backstage di produzione: personaggi, sceneggiature, immagini, voci e video",
};

const NAV = [
  { href: "/", label: "📖 Guida" },
  { href: "/personaggi", label: "🦉 Personaggi" },
  { href: "/episodi", label: "🎬 Episodi" },
  { href: "/impostazioni", label: "⚙️ Impostazioni" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans md:flex-row">
        <aside className="border-b border-stone-200 bg-white md:min-h-screen md:w-56 md:border-r md:border-b-0">
          <div className="px-5 py-4 text-lg font-bold text-orange-600">Studio</div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-orange-50"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </body>
    </html>
  );
}
