import { Suspense } from "react";

// L'id dell'episodio è noto solo a runtime: l'editor viene caricato in streaming
export default function EpisodeLayout({ children }: LayoutProps<"/episodi/[id]">) {
  return <Suspense fallback={<p className="muted">Caricamento…</p>}>{children}</Suspense>;
}
