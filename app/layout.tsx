import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import Assistant from "@/components/Assistant";
import Rail from "@/components/Rail";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans md:flex-row">
        {/* Rail e Assistente leggono la pagina corrente: vengono caricati in streaming */}
        <Suspense fallback={<div className="h-14 shrink-0 border-b border-line md:h-screen md:w-20 md:border-r md:border-b-0" />}>
          <Rail />
        </Suspense>
        <main className="w-full min-w-0 flex-1 p-4 pb-24 md:p-8">{children}</main>
        <Suspense>
          <Assistant />
        </Suspense>
      </body>
    </html>
  );
}
