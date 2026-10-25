"use client";

import type Anthropic from "@anthropic-ai/sdk";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Proposal } from "@/lib/agent";
import { api } from "@/lib/client";
import { usd } from "@/lib/costs";
import { OPEN_ASSISTANT_EVENT, requestRefresh, useUiContext } from "@/lib/ui-bus";

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = { type: string; text?: string; name?: string; id?: string; input?: Record<string, unknown> };
type ActionState = { status: "idle" | "running" | "done" | "error"; note?: string };

const STORAGE_KEY = "studio-assistant-v1";

const TOOL_LABELS: Record<string, string> = {
  stato_studio: "Ho controllato lo stato dello Studio",
  leggi_episodio: "Ho letto l'episodio",
  crea_personaggio: "Ho creato un personaggio",
  modifica_personaggio: "Ho modificato un personaggio",
  crea_episodio: "Ho creato un episodio",
  modifica_scena: "Ho modificato una scena",
  imposta_studio: "Ho aggiornato le impostazioni",
  cerca_voci: "Ho cercato le voci disponibili",
  leggi_rassegna: "Ho letto la rassegna stampa",
};

function suggestions(path: string, scene?: number) {
  if (path.startsWith("/episodi/"))
    return [
      "Cosa devo fare adesso in questo episodio?",
      scene ? `Controlla la scena ${scene}: il prompt va bene?` : "Spiegami come funziona questo editor",
      "Quanto mi costerà finire questo episodio?",
    ];
  if (path.startsWith("/personaggi"))
    return ["Aiutami a creare la mascotte del canale", "Come ottengo un personaggio sempre uguale?", "Quali voci italiane posso usare?"];
  if (path.startsWith("/episodi"))
    return ["Creiamo il primo episodio insieme", "Che argomento mi consigli per la 3ª?", "Spiegami il flusso di un episodio"];
  if (path.startsWith("/rassegna"))
    return ["Riassumimi la rassegna in 5 righe", "Cosa cambia per i miei piani di lancio?", "Quale notizia è più urgente e perché?"];
  if (path.startsWith("/impostazioni"))
    return ["Dove trovo le chiavi API?", "Scegli tu una voce per il narratore", "Cosa cambia lo stile visivo?"];
  return ["Da dove comincio?", "Spiegami tutto il flusso in parole semplici", "Cosa manca per fare il primo episodio?"];
}

function load(): { history: Msg[]; proposals: Record<string, Proposal> } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { history: [], proposals: {} };
}

// Markdown minimo: **grassetto**, `codice`, elenchi e a capo
function Rich({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith("**") ? (
        <strong key={i} className="text-foreground">
          {part.slice(2, -2)}
        </strong>
      ) : part.startsWith("`") ? (
        <code key={i} className="rounded bg-black/40 px-1 font-mono text-[12px] text-accent">
          {part.slice(1, -1)}
        </code>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
  // raggruppa le righe consecutive che iniziano con "|" in tabelle
  const segments: (string | string[][])[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("|")) {
      if (/^\|[\s:|-]+\|$/.test(t)) continue; // riga di separazione |---|
      const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const last = segments[segments.length - 1];
      if (Array.isArray(last)) last.push(cells);
      else segments.push([cells]);
    } else segments.push(line);
  }
  return (
    <div className="space-y-1.5">
      {segments.map((line, i) => {
        if (Array.isArray(line))
          return (
            <div key={i} className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <tbody>
                  {line.map((row, r) => (
                    <tr key={r} className={r === 0 ? "bg-black/30 font-semibold text-foreground" : "border-t border-line"}>
                      {row.map((c, ci) => (
                        <td key={ci} className="px-2 py-1.5 align-top">
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        const t = line.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^#{1,3}\s/.test(t)) return <div key={i} className="pt-1 font-semibold text-foreground">{inline(t.replace(/^#+\s/, ""))}</div>;
        const li = t.match(/^([-*•]|\d+[.)])\s+(.*)$/);
        if (li)
          return (
            <div key={i} className="flex gap-2">
              <span className="text-accent">{/\d/.test(li[1]) ? li[1] : "•"}</span>
              <span>{inline(li[2])}</span>
            </div>
          );
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}

export default function Assistant() {
  const router = useRouter();
  const path = usePathname();
  const ui = useUiContext();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Msg[]>([]);
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [notes, setNotes] = useState<string[]>([]); // azioni eseguite da comunicare all'assistente
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = load();
    // ripristino dalla sessione: sessionStorage esiste solo nel browser
    setHistory(saved.history);
    setProposals(saved.proposals);
    const onOpen = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent<string | undefined>).detail;
      if (q) setText(q);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ history, proposals }));
    } catch {}
  }, [history, proposals]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, thinking, open]);

  function contextString() {
    const parts = [`pagina ${path}`];
    if (ui.episodeId) parts.push(`episodio aperto: ${ui.episodeId}`);
    if (ui.scene) parts.push(`scena selezionata: ${ui.scene}`);
    if (notes.length) parts.push(`azioni eseguite dall'utente dopo l'ultimo messaggio: ${notes.join("; ")}`);
    return parts.join(" · ");
  }

  async function send(q: string) {
    if (!q.trim() || thinking) return;
    setText("");
    setError("");
    setThinking(true);
    // mostra subito il messaggio dell'utente
    const optimistic: Msg[] = [...history, { role: "user", content: [{ type: "text", text: "" }, { type: "text", text: q }] }];
    setHistory(optimistic);
    try {
      const r = await api<{ messages: Msg[]; proposals: Record<string, Proposal>; changed: boolean }>("/api/assistant", {
        json: { history, text: q, context: contextString() },
      });
      setHistory(r.messages);
      setProposals((p) => ({ ...p, ...r.proposals }));
      setNotes([]);
      if (r.changed) {
        requestRefresh();
        router.refresh();
      }
    } catch (e) {
      setHistory(history);
      setText(q);
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function execute(id: string, p: Proposal) {
    if (p.kind === "vai_a") {
      if (p.path) router.push(p.path);
      setActions((a) => ({ ...a, [id]: { status: "done" } }));
      return;
    }
    if (p.kind === "rassegna") {
      setActions((a) => ({ ...a, [id]: { status: "running", note: "Cerco sul web, 1-3 minuti…" } }));
      try {
        await api("/api/press", { json: {} });
        setActions((a) => ({ ...a, [id]: { status: "done" } }));
        setNotes((n) => [...n, "nuova rassegna stampa creata"]);
        requestRefresh();
        if (path !== "/rassegna") router.push("/rassegna");
      } catch (e) {
        setActions((a) => ({ ...a, [id]: { status: "error", note: (e as Error).message } }));
      }
      return;
    }
    const body =
      p.kind === "sceneggiatura"
        ? { action: "script" }
        : p.kind === "immagini"
          ? { action: "images", scene: p.scene, count: p.count ?? 2 }
          : p.kind === "video"
            ? { action: "video", scene: p.scene }
            : p.kind === "voci"
              ? { action: "voices", scene: p.scene ?? undefined }
              : { action: "export" };
    setActions((a) => ({ ...a, [id]: { status: "running" } }));
    try {
      const r = await api<{ export?: { dir: string } }>(`/api/episodes/${p.episodeId}`, { json: body });
      setActions((a) => ({ ...a, [id]: { status: "done", note: r.export ? `Cartella: ${r.export.dir}` : undefined } }));
      setNotes((n) => [...n, `${p.label} (completata)`]);
      requestRefresh();
      if (p.episodeId && !path.startsWith(`/episodi/${p.episodeId}`)) router.push(`/episodi/${p.episodeId}`);
    } catch (e) {
      setActions((a) => ({ ...a, [id]: { status: "error", note: (e as Error).message } }));
      setNotes((n) => [...n, `${p.label} (errore: ${(e as Error).message})`]);
    }
  }

  function reset() {
    setHistory([]);
    setProposals({});
    setActions({});
    setNotes([]);
    setError("");
  }

  // Trasforma la storia dell'API in bolle della chat.
  // I pulsanti delle azioni proposte vanno in fondo al turno, sotto la risposta.
  const bubbles: React.ReactNode[] = [];
  let cards: React.ReactNode[] = [];
  const flush = () => {
    bubbles.push(...cards);
    cards = [];
  };
  history.forEach((m, mi) => {
    const blocks = (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content) as Block[];
    if (m.role === "user") {
      const userText = blocks.filter((b) => b.type === "text").slice(-1)[0]?.text;
      if (userText && !blocks.some((b) => b.type === "tool_result")) {
        flush();
        bubbles.push(
          <div key={mi} className="ml-8 self-end rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2.5 text-sm text-foreground">
            {userText}
          </div>,
        );
      }
      return;
    }
    blocks.forEach((b, bi) => {
      const key = `${mi}-${bi}`;
      if (b.type === "text" && b.text?.trim())
        bubbles.push(
          <div key={key} className="mr-4 rounded-2xl rounded-bl-md bg-panel-2 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-300">
            <Rich text={b.text} />
          </div>,
        );
      if (b.type === "tool_use" && b.name === "proponi_azione" && b.id && proposals[b.id]) {
        const p = proposals[b.id];
        const st = actions[b.id] ?? { status: "idle" };
        cards.push(
          <div key={key} className="mr-4 rounded-2xl border border-accent/40 bg-accent/5 p-3">
            <div className="text-xs text-muted">{p.reason}</div>
            <button className="btn mt-2 w-full" disabled={st.status === "running" || st.status === "done"} onClick={() => execute(b.id!, p)}>
              {st.status === "running" ? "In corso…" : st.status === "done" ? "✓ Fatto" : p.label}
              {p.cost != null && st.status === "idle" && <span className="rounded bg-black/20 px-1.5 py-0.5 text-[11px]">{usd(p.cost)}</span>}
            </button>
            {st.note && <div className={`mt-2 break-all text-xs ${st.status === "error" ? "text-red-300" : "text-muted"}`}>{st.note}</div>}
          </div>,
        );
      } else if (b.type === "tool_use" && b.name && TOOL_LABELS[b.name]) {
        bubbles.push(
          <div key={key} className="self-start rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">
            ⚙︎ {TOOL_LABELS[b.name]}
          </div>,
        );
      }
    });
  });
  flush();

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-2 px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-accent/20 transition hover:brightness-110"
        >
          ✨ Assistente
        </button>
      )}

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-[#101014] shadow-2xl transition-transform duration-300 sm:w-[420px] ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-semibold">✨ Assistente dello Studio</div>
            <div className="text-[11px] text-muted">Ti guida passo passo · le operazioni a pagamento le decidi tu</div>
          </div>
          <div className="flex gap-1">
            <button className="chip" onClick={reset} title="Nuova conversazione">
              Nuova
            </button>
            <button className="chip" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
          {history.length === 0 && (
            <div className="rounded-2xl bg-panel-2 p-4 text-sm leading-relaxed text-zinc-300">
              Ciao! Sono qui per accompagnarti in tutto il flusso: personaggi, sceneggiature, immagini, voci ed export.
              <br />
              <br />
              Chiedimi qualsiasi cosa, anche la più semplice. So in che pagina ti trovi.
            </div>
          )}
          {bubbles}
          {thinking && (
            <div className="mr-4 flex items-center gap-2 rounded-2xl bg-panel-2 px-3.5 py-2.5 text-sm text-muted">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" /> Sto pensando…
            </div>
          )}
          {error && <div className="msg-err">{error}</div>}
          <div ref={endRef} />
        </div>

        <div className="border-t border-line p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions(path, ui.scene).map((s) => (
              <button key={s} className="chip text-left" disabled={thinking} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <textarea
              className="input max-h-40 min-h-11 resize-none"
              rows={1}
              placeholder="Scrivi una domanda…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
            />
            <button className="btn h-11" disabled={thinking || !text.trim()}>
              ➤
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
