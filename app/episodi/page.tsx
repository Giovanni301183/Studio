"use client";

import AskButton from "@/components/AskButton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, GRADES, SUBJECTS } from "@/lib/client";
import type { Character, Episode } from "@/lib/types";

const STATUS: Record<Episode["status"], string> = {
  bozza: "Bozza",
  sceneggiatura: "Sceneggiatura pronta",
  asset: "Asset in lavorazione",
  esportato: "Esportato",
};

export default function EpisodesPage() {
  const router = useRouter();
  const [eps, setEps] = useState<Episode[]>([]);
  const [chars, setChars] = useState<Character[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Episode[]>("/api/episodes").then(setEps).catch((e) => setError(e.message));
    api<Character[]>("/api/characters").then(setChars).catch(() => {});
  }, []);

  async function create(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    try {
      const ep = await api<Episode>("/api/episodes", { method: "POST", body: new FormData(form) });
      router.push(`/episodi/${ep.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="h1">Episodi</h1><AskButton q="Creiamo insieme un nuovo episodio: fammi tu le domande">✨ Crealo con l&apos;assistente</AskButton></div>

      <form
        className="card grid gap-4 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          create(e.currentTarget);
        }}
      >
        <h2 className="font-semibold md:col-span-3">Nuovo episodio</h2>
        <div>
          <label className="label">Classe</label>
          <select name="grade" className="input" defaultValue="3ª">
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Materia</label>
          <select name="subject" className="input" defaultValue="Storia">
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Codice (facoltativo)</label>
          <input name="code" className="input" placeholder="Es. S3-STO-004" />
        </div>
        <div className="md:col-span-3">
          <label className="label">Argomento</label>
          <input name="topic" className="input" placeholder="Es. La scoperta del fuoco" required />
        </div>
        <div className="md:col-span-3">
          <label className="label">Obiettivi di apprendimento (facoltativo)</label>
          <textarea
            name="objectives"
            className="input min-h-16"
            placeholder="Es. Capire come il fuoco ha cambiato la vita degli uomini primitivi"
          />
        </div>
        <div>
          <label className="label">Durata (minuti)</label>
          <input name="durationMin" type="number" min={1} max={12} defaultValue={5} className="input" />
        </div>
        <div>
          <label className="label">Formato</label>
          <select name="aspect" className="input" defaultValue="16:9">
            <option value="16:9">16:9 — YouTube (episodio lungo)</option>
            <option value="9:16">9:16 — Shorts / Reels / TikTok</option>
          </select>
        </div>
        <div>
          <label className="label">Materiale (PDF, foto del libro, .txt)</label>
          <input name="source" type="file" accept=".pdf,image/*,.txt,.md" className="input" />
        </div>
        <div className="md:col-span-3">
          <label className="label">Personaggi nella puntata</label>
          {chars.length === 0 ? (
            <p className="muted">
              Nessun personaggio ancora. <Link href="/personaggi" className="text-accent underline">Creane uno</Link>{" "}
              (puoi anche procedere solo con il narratore).
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {chars.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <input type="checkbox" name="characterIds" value={c.id} defaultChecked />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="md:col-span-3">
          <label className="label">Note per l&apos;autore (facoltativo)</label>
          <input name="notes" className="input" placeholder="Es. Ambientare la storia in una grotta, finale divertente" />
        </div>
        <div className="md:col-span-3">
          <button className="btn" disabled={busy}>
            {busy ? "Creazione…" : "Crea episodio"}
          </button>
        </div>
      </form>

      {error && <p className="msg-err">{error}</p>}

      <div className="grid gap-3">
        {eps.map((e) => (
          <Link key={e.id} href={`/episodi/${e.id}`} className="card flex flex-wrap items-center justify-between gap-2 hover:border-accent/50">
            <div>
              <div className="text-xs font-mono text-muted">{e.code}</div>
              <div className="font-semibold">{e.title ?? e.topic}</div>
              <div className="muted">
                {e.grade} · {e.subject} · {e.durationMin} min · {e.aspect}
              </div>
            </div>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">{STATUS[e.status]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
