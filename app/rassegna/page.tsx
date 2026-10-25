"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { COST, usd } from "@/lib/costs";
import type { PressDigest } from "@/lib/press";
import { askAssistant, REFRESH_EVENT } from "@/lib/ui-bus";

type ListItem = { id: string; createdAt: string; focus: string; items: number };

const CATEGORY_ICON: Record<string, string> = {
  "Strumenti AI": "✦",
  "Piattaforme e regole": "▶",
  "Scuola e didattica": "✎",
  "Mercato e concorrenti": "◎",
  "Leggi e privacy": "§",
  "Idee e tendenze": "☆",
};

const PRIORITY = {
  alta: { label: "Priorità alta", cls: "border-red-500/40 bg-red-500/10 text-red-300" },
  media: { label: "Da seguire", cls: "border-amber-500/40 bg-amber-500/10 text-amber-200" },
  bassa: { label: "Curiosità", cls: "border-line bg-panel-2 text-muted" },
};

const fmt = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function PressPage() {
  const [list, setList] = useState<ListItem[]>([]);
  const [digest, setDigest] = useState<PressDigest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cat, setCat] = useState<string>("Tutte");

  const load = useCallback((id?: string) => {
    api<{ list: ListItem[]; digest: PressDigest | null }>(`/api/press${id ? `?id=${encodeURIComponent(id)}` : ""}`)
      .then((r) => {
        setList(r.list);
        setDigest(r.digest);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [load]);

  async function update() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ digest: PressDigest }>("/api/press", { json: { focus } });
      setDigest(r.digest);
      setCat("Tutte");
      load(r.digest.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const categories = digest ? ["Tutte", ...new Set(digest.items.map((i) => i.category))] : [];
  const order = { alta: 0, media: 1, bassa: 2 };
  const items = (digest?.items ?? []).filter((i) => cat === "Tutte" || i.category === cat).sort((a, b) => order[a.priority] - order[b.priority]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Rassegna stampa</h1>
          <p className="muted mt-1 max-w-2xl">
            Le novità degli ultimi 30 giorni su strumenti AI, regole delle piattaforme, scuola, mercato e leggi, con il consiglio dell&apos;AI su
            cosa fare per il canale.
          </p>
        </div>
        {list.length > 0 && (
          <select className="input w-auto" value={digest?.id ?? ""} onChange={(e) => load(e.target.value)}>
            {list.map((l) => (
              <option key={l.id} value={l.id}>
                {fmt(l.createdAt)}
                {l.focus ? ` · ${l.focus}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="panel flex flex-col gap-3 p-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="label">Tema su cui insistere (facoltativo)</label>
          <input
            className="input"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Es. novità di Kling e Veo, regole YouTube sui contenuti AI, nuove Indicazioni Nazionali…"
          />
        </div>
        <button className="btn px-6 py-3" disabled={busy} onClick={update}>
          {busy ? "Cerco sul web… (1-3 min)" : `✦ Nuova rassegna · ${usd(COST.press)}`}
        </button>
      </div>

      {error && <div className="msg-err">{error}</div>}

      {busy && (
        <div className="panel flex items-center gap-3 p-4 text-sm text-muted">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
          Claude sta leggendo le notizie e preparando i consigli. Puoi continuare a usare lo Studio nel frattempo, ma non chiudere questa pagina.
        </div>
      )}

      {loaded && !digest && !busy && (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center">
          <div className="text-4xl">📰</div>
          <div className="text-lg font-semibold">Nessuna rassegna ancora</div>
          <p className="muted max-w-md">
            Premi &quot;Nuova rassegna&quot;: Claude cerca sul web e ti dice cosa è cambiato e cosa conviene fare. Consiglio: una volta a settimana,
            il lunedì.
          </p>
        </div>
      )}

      {digest && (
        <>
          <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#16181a] via-[#121215] to-[#0f1512] p-6">
            <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-accent/10 blur-3xl" />
            <div className="label">Rassegna del {fmt(digest.createdAt)}</div>
            <p className="max-w-3xl text-base leading-relaxed text-zinc-200">{digest.headline}</p>
            <div className="mt-5">
              <div className="label text-accent">Cosa fare questa settimana</div>
              <ol className="space-y-2">
                {digest.actionsThisWeek.map((a, i) => (
                  <li key={a} className="flex flex-wrap items-start gap-3 rounded-xl bg-black/30 p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-black">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-sm">{a}</span>
                    <button className="chip" onClick={() => askAssistant(`Aiutami a fare questa cosa, passo passo: "${a}"`)}>
                      ✨ Aiutami
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button key={c} className={cat === c ? "chip-on" : "chip"} onClick={() => setCat(c)}>
                {CATEGORY_ICON[c] ? `${CATEGORY_ICON[c]} ` : ""}
                {c}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {items.map((it) => (
              <article key={it.url + it.title} className="panel flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="chip">
                    {CATEGORY_ICON[it.category]} {it.category}
                  </span>
                  <span className={`rounded-lg border px-2 py-1 ${PRIORITY[it.priority].cls}`}>{PRIORITY[it.priority].label}</span>
                  <span className="ml-auto text-muted">
                    {it.source} · {it.date}
                  </span>
                </div>
                <a href={it.url} target="_blank" rel="noreferrer" className="font-semibold leading-snug hover:text-accent">
                  {it.title} ↗
                </a>
                <p className="text-sm text-zinc-300">{it.summary}</p>
                <div className="rounded-xl bg-panel-2 p-3 text-sm">
                  <div className="label">Perché ti riguarda</div>
                  <p className="text-zinc-300">{it.whyItMatters}</p>
                </div>
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
                  <div className="label text-accent">Consiglio</div>
                  <p className="text-zinc-200">{it.action}</p>
                </div>
                <button
                  className="chip mt-auto self-start"
                  onClick={() => askAssistant(`Riguardo alla notizia "${it.title}" (${it.source}): cosa mi consigli di fare concretamente nel mio progetto?`)}
                >
                  ✨ Parliamone
                </button>
              </article>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            Riassunti e consigli sono generati dall&apos;AI: prima di decisioni importanti apri la fonte originale e verifica.
          </p>
        </>
      )}
    </div>
  );
}
