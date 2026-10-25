"use client";

import AskButton from "@/components/AskButton";
import { useCallback, useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/client";
import type { Character } from "@/lib/types";

type Result = { character: Character; created?: string[] };

export default function CharactersPage() {
  const [chars, setChars] = useState<Character[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(() => api<Character[]>("/api/characters").then(setChars).catch((e) => setError(e.message)), []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function create(form: HTMLFormElement) {
    setCreating(true);
    setError("");
    try {
      await api("/api/characters", { method: "POST", body: new FormData(form) });
      form.reset();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="h1">Personaggi</h1><AskButton q="Aiutami a creare un personaggio sempre uguale in tutte le scene">✨ Come si fa?</AskButton></div>
        <p className="muted mt-1">
          I riferimenti sono le immagini che l&apos;AI usa per disegnare sempre lo stesso personaggio. Ne servono almeno 3
          buoni: scheda di rotazione, espressioni, una posa intera.
        </p>
      </div>

      <form
        className="card grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create(e.currentTarget);
        }}
      >
        <h2 className="font-semibold md:col-span-2">Nuovo personaggio</h2>
        <div>
          <label className="label">Nome</label>
          <input name="name" className="input" placeholder="Es. Gufo Ottavio" required />
        </div>
        <div>
          <label className="label">Ruolo</label>
          <input name="role" className="input" placeholder="Es. mascotte e narratore" />
        </div>
        <div className="md:col-span-2">
          <label className="label">Aspetto e carattere (più preciso possibile)</label>
          <textarea
            name="description"
            className="input min-h-24"
            placeholder="Es. A small round owl with soft brown feathers, big round glasses, a green scarf, curious and kind. (In inglese l'AI è più precisa)"
          />
        </div>
        <div>
          <label className="label">ID voce ElevenLabs</label>
          <input name="voiceId" className="input" placeholder="Facoltativo, puoi aggiungerlo dopo" />
        </div>
        <div>
          <label className="label">Immagini di riferimento</label>
          <input name="references" type="file" accept="image/*" multiple className="input" />
        </div>
        <div className="md:col-span-2">
          <button className="btn" disabled={creating}>
            {creating ? "Salvataggio…" : "Crea personaggio"}
          </button>
        </div>
      </form>

      {error && <p className="msg-err">{error}</p>}

      {chars.map((c) => (
        <CharacterCard key={c.id} c={c} onChange={reload} />
      ))}
    </div>
  );
}

function CharacterCard({ c, onChange }: { c: Character; onChange: () => void }) {
  const [busy, setBusy] = useState("");
  const [proposals, setProposals] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState({ description: c.description, voiceId: c.voiceId });

  async function act(action: string, extra: Record<string, string | File[]> = {}) {
    setBusy(action);
    setError("");
    const fd = new FormData();
    fd.set("action", action);
    for (const [k, v] of Object.entries(extra)) {
      if (Array.isArray(v)) v.forEach((f) => fd.append(k, f));
      else fd.set(k, v);
    }
    try {
      const r = await api<Result>(`/api/characters/${c.id}`, { method: "POST", body: fd });
      if (r.created) setProposals((p) => [...r.created!, ...p]);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!confirm(`Eliminare ${c.name} e tutte le sue immagini?`)) return;
    await api(`/api/characters/${c.id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <p className="muted">{c.role}</p>
        </div>
        <button className="btn-danger" onClick={remove}>
          Elimina
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_16rem]">
        <textarea
          className="input min-h-20"
          value={edit.description}
          onChange={(e) => setEdit({ ...edit, description: e.target.value })}
        />
        <div className="space-y-2">
          <input
            className="input"
            placeholder="ID voce ElevenLabs"
            value={edit.voiceId}
            onChange={(e) => setEdit({ ...edit, voiceId: e.target.value })}
          />
          <button className="btn-secondary w-full" disabled={!!busy} onClick={() => act("update", edit)}>
            Salva modifiche
          </button>
        </div>
      </div>

      <div>
        <div className="label">Riferimenti ({c.references.length})</div>
        <div className="flex flex-wrap gap-3">
          {c.references.map((r) => (
            <div key={r} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(r)} alt="" className="h-32 rounded-xl border border-line object-contain" />
              <button
                className="absolute top-1 right-1 hidden rounded-full bg-black/80 px-2 text-xs text-danger group-hover:block"
                onClick={() => act("removeRef", { ref: r })}
              >
                ✕
              </button>
            </div>
          ))}
          <label className="btn-secondary h-32 w-32 cursor-pointer flex-col text-center">
            + Carica
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && act("update", { references: Array.from(e.target.files) })}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={!!busy} onClick={() => act("concept")}>
          {busy === "concept" ? "Genero…" : "✨ 4 proposte di design"}
        </button>
        <button className="btn-secondary" disabled={!!busy || c.references.length === 0} onClick={() => act("sheet")}>
          {busy === "sheet" ? "Genero…" : "🔄 Scheda di rotazione"}
        </button>
        <button className="btn-secondary" disabled={!!busy || c.references.length === 0} onClick={() => act("expressions")}>
          {busy === "expressions" ? "Genero…" : "😊 Scheda espressioni"}
        </button>
      </div>
      {c.references.length === 0 && (
        <p className="muted text-xs">Rotazione ed espressioni si attivano dopo aver aggiunto almeno un riferimento.</p>
      )}

      {proposals.length > 0 && (
        <div>
          <div className="label">Proposte generate: clicca &quot;Usa come riferimento&quot; su quelle buone</div>
          <div className="flex flex-wrap gap-3">
            {proposals.map((p) => (
              <div key={p} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(p)} alt="" className="h-44 rounded-xl border border-line object-contain" />
                <button
                  className="btn-secondary w-full text-xs"
                  disabled={c.references.includes(p)}
                  onClick={() => act("promote", { ref: p })}
                >
                  {c.references.includes(p) ? "✓ Riferimento" : "Usa come riferimento"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="msg-err">{error}</p>}
    </div>
  );
}
