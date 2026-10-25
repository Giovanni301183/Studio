"use client";

import { askAssistant } from "@/lib/ui-bus";

/** Pulsante che apre l'assistente con una domanda già scritta. */
export default function AskButton({ q, children, className }: { q: string; children: React.ReactNode; className?: string }) {
  return (
    <button className={className ?? "chip"} onClick={() => askAssistant(q)}>
      {children}
    </button>
  );
}
