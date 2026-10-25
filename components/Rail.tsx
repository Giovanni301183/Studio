"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", icon: "⌂", label: "Home" },
  { href: "/personaggi", icon: "◉", label: "Personaggi" },
  { href: "/episodi", icon: "▶", label: "Episodi" },
  { href: "/rassegna", icon: "✦", label: "Rassegna" },
  { href: "/impostazioni", icon: "⚙", label: "Impost." },
];

export default function Rail() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="sticky top-0 z-30 flex shrink-0 items-center gap-1 border-b border-line bg-[#0e0e12] px-2 py-2 md:h-screen md:w-20 md:flex-col md:border-r md:border-b-0 md:py-4">
      <Link href="/" className="mr-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-lg font-black text-black md:mr-0 md:mb-4">
        S
      </Link>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[10px] font-medium transition md:w-16 ${
            active(n.href) ? "bg-panel-2 text-accent" : "text-muted hover:bg-panel hover:text-foreground"
          }`}
        >
          <span className="text-lg leading-none">{n.icon}</span>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
