"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fileUrl } from "@/lib/client";
import type { Character, Episode, Scene, SocialTexts } from "@/lib/types";

type Loaded = { ep: Episode; chars: Character[] };

export default function EpisodeEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ep, setEp] = useState<Episode | null>(null);
  const [chars, setChars] = useState<Character[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(""); // chiave dell'azione in corso
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Loaded>(`/api/episodes/${id}`)
      .then((r) => {
        setEp(r.ep);
        setChars(r.chars);
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [id]);

  const update = (patch: Partial<Episode>) => {
    setEp((e) => (e ? { ...e, ...patch } : e));
    setDirty(true);
  };
  const updateScene = (n: number, patch: Partial<Scene>) =>
    update({ scenes: ep!.scenes.map((s) => (s.number === n ? { ...s, ...patch } : s)) });

  // Ogni azione salva prima le modifiche manuali, così il server lavora sulla versione aggiornata
  async function run(key: string, body: Record<string, unknown>, okText?: string) {
    if (!ep) return;
    setBusy(key);
    setMsg(null);
    try {
      if (dirty) await api(`/api/episodes/${id}`, { json: { action: "save", episode: ep } });
      const r = await api<{ episode: Episode; export?: { dir: string } }>(`/api/episodes/${id}`, { json: body });
      setEp(r.episode);
      setDirty(false);
      if (r.export) setMsg({ ok: true, text: `Pacchetto esportato in: ${r.export.dir}` });
      else if (okText) setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!confirm("Eliminare l'episodio e tutti i file generati?")) return;
    await api(`/api/episodes/${id}`, { method: "DELETE" });
    router.push("/episodi");
  }

  if (!ep) return <p className="muted">{msg?.text ?? "Caricamento…"}</p>;

  const speakers = ["NARRATORE", ...chars.map((c) => c.name)];
  const totalSec = ep.scenes.reduce((a, s) => a + (Number(s.durationSec) || 0), 0);
  const allLines = ep.scenes.flatMap((s) => s.lines);
  const voiced = allLines.filter((l) => l.audio).length;
  const withImage = ep.scenes.filter((s) => s.selectedImage).length;

  return (
    <div className="space-y-6">
      {/* Intestazione e azioni principali */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-xs text-stone-500">{ep.code}</div>
            <input
              className="w-full bg-transparent text-2xl font-bold outline-none"
              value={ep.title ?? ep.topic}
              onChange={(e) => update({ title: e.target.value })}
            />
            <p className="muted">
              {ep.grade} · {ep.subject} · {ep.topic} · {ep.durationMin} min previsti · {ep.aspect}
              {ep.sourceFile && (
                <>
                  {" · "}
                  <a className="text-orange-600 underline" href={fileUrl(ep.sourceFile)} target="_blank">
                    materiale caricato
                  </a>
                </>
              )}
            </p>
          </div>
          <button className="btn-danger" onClick={remove}>
            Elimina
          </button>
        </div>

        {ep.scenes.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-stone-100 px-3 py-1">{ep.scenes.length} scene · {Math.round(totalSec / 6) / 10} min</span>
            <span className="rounded-full bg-stone-100 px-3 py-1">Immagini scelte: {withImage}/{ep.scenes.length}</span>
            <span className="rounded-full bg-stone-100 px-3 py-1">Voci: {voiced}/{allLines.length}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            disabled={!!busy}
            onClick={() => {
              if (ep.scenes.length && !confirm("Rigenerare la sceneggiatura? Scene, immagini e voci attuali verranno sostituite.")) return;
              run("script", { action: "script" }, "Sceneggiatura generata ✓ — ora va fatta la revisione didattica.");
            }}
          >
            {busy === "script" ? "Claude sta scrivendo… (1-2 min)" : ep.scenes.length ? "↻ Rigenera sceneggiatura" : "✍️ Genera sceneggiatura"}
          </button>
          {ep.scenes.length > 0 && (
            <>
              <button className="btn-secondary" disabled={!!busy} onClick={() => run("voices", { action: "voices" }, "Voci generate ✓")}>
                {busy === "voices" ? "Genero le voci…" : "🎙️ Genera tutte le voci"}
              </button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => run("export", { action: "export" })}>
                {busy === "export" ? "Esporto…" : "📦 Esporta pacchetto"}
              </button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => run("n8n", { action: "n8n" }, "Inviato a n8n ✓")}>
                {busy === "n8n" ? "Invio…" : "🔗 Invia a n8n"}
              </button>
            </>
          )}
          {dirty && (
            <button className="btn-secondary border-orange-400" disabled={!!busy} onClick={() => run("save", { action: "save", episode: ep }, "Salvato ✓")}>
              💾 Salva modifiche
            </button>
          )}
        </div>

        {msg && (
          <p className={`rounded-xl p-3 text-sm break-all ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            {msg.text}
          </p>
        )}
      </div>

      {ep.scenes.length === 0 && (
        <div className="card muted">
          Premi <b>Genera sceneggiatura</b>: Claude userà classe, argomento, personaggi e l&apos;eventuale materiale caricato.
        </div>
      )}

      {ep.learningObjectives && ep.learningObjectives.length > 0 && (
        <div className="card">
          <div className="label">Obiettivi di apprendimento</div>
          <ul className="list-disc pl-5 text-sm">
            {ep.learningObjectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Scene */}
      {ep.scenes.map((s) => (
        <SceneCard
          key={s.number}
          s={s}
          ep={ep}
          speakers={speakers}
          chars={chars}
          busy={busy}
          onChange={(patch) => updateScene(s.number, patch)}
          onRun={run}
          onDelete={() => update({ scenes: ep.scenes.filter((x) => x.number !== s.number).map((x, i) => ({ ...x, number: i + 1 })) })}
        />
      ))}

      {ep.scenes.length > 0 && (
        <button
          className="btn-secondary"
          onClick={() =>
            update({
              scenes: [
                ...ep.scenes,
                {
                  number: ep.scenes.length + 1,
                  title: "Nuova scena",
                  durationSec: 15,
                  visual: "",
                  imagePrompt: "",
                  characters: [],
                  motion: "",
                  useAiVideo: false,
                  lines: [{ speaker: "NARRATORE", text: "" }],
                  images: [],
                },
              ],
            })
          }
        >
          + Aggiungi scena
        </button>
      )}

      {/* Quiz */}
      {ep.quiz && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Quiz</h2>
          {ep.quiz.map((q, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-2">
              <input
                className="input"
                value={q.question}
                onChange={(e) => update({ quiz: ep.quiz!.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })}
              />
              <input
                className="input"
                value={q.answer}
                onChange={(e) => update({ quiz: ep.quiz!.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })}
              />
            </div>
          ))}
        </div>
      )}

      {/* Testi social */}
      {ep.social && <SocialCard social={ep.social} onChange={(social) => update({ social })} />}
    </div>
  );
}

function SceneCard(props: {
  s: Scene;
  ep: Episode;
  speakers: string[];
  chars: Character[];
  busy: string;
  onChange: (patch: Partial<Scene>) => void;
  onRun: (key: string, body: Record<string, unknown>, okText?: string) => void;
  onDelete: () => void;
}) {
  const { s, ep, speakers, chars, busy, onChange, onRun, onDelete } = props;
  const k = (a: string) => `${a}-${s.number}`;
  const setLine = (i: number, patch: Partial<Scene["lines"][number]>) =>
    onChange({ lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg bg-orange-100 px-2 py-1 text-sm font-bold text-orange-700">SCENA {s.number}</span>
        <input className="input max-w-md flex-1 font-semibold" value={s.title} onChange={(e) => onChange({ title: e.target.value })} />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="number"
            className="input w-20"
            value={s.durationSec}
            onChange={(e) => onChange({ durationSec: Number(e.target.value) })}
          />
          sec
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.useAiVideo} onChange={(e) => onChange({ useAiVideo: e.target.checked })} />
          Video AI
        </label>
        <button className="btn-danger ml-auto" onClick={() => confirm("Eliminare la scena?") && onDelete()}>
          Elimina scena
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Colonna testi */}
        <div className="space-y-3">
          <div>
            <label className="label">Descrizione (storyboard)</label>
            <textarea className="input min-h-16" value={s.visual} onChange={(e) => onChange({ visual: e.target.value })} />
          </div>
          <div>
            <label className="label">Prompt immagine (inglese)</label>
            <textarea className="input min-h-24 font-mono text-xs" value={s.imagePrompt} onChange={(e) => onChange({ imagePrompt: e.target.value })} />
          </div>
          <div>
            <label className="label">Movimento / animazione</label>
            <input className="input" value={s.motion} onChange={(e) => onChange({ motion: e.target.value })} />
          </div>
          <div>
            <label className="label">Personaggi in scena (si usano i loro riferimenti)</label>
            <div className="flex flex-wrap gap-2">
              {chars.map((c) => {
                const on = s.characters.some((n) => n.toLowerCase() === c.name.toLowerCase());
                return (
                  <button
                    key={c.id}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-orange-400 bg-orange-50 text-orange-700" : "border-stone-300 text-stone-500"}`}
                    onClick={() =>
                      onChange({
                        characters: on ? s.characters.filter((n) => n.toLowerCase() !== c.name.toLowerCase()) : [...s.characters, c.name],
                      })
                    }
                  >
                    {on ? "✓ " : ""}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Colonna immagini */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={!!busy || !s.imagePrompt} onClick={() => onRun(k("img"), { action: "images", scene: s.number })}>
              {busy === k("img") ? "Genero… (~30 s)" : s.images.length ? "🎨 Altre 2 varianti" : "🎨 Genera immagini"}
            </button>
            <button
              className="btn-secondary"
              disabled={!!busy || !s.selectedImage}
              title="Clip di 5-10 secondi dall'immagine scelta"
              onClick={() => onRun(k("vid"), { action: "video", scene: s.number }, "Clip animata pronta ✓")}
            >
              {busy === k("vid") ? "Animo… (1-3 min)" : "🎞️ Anima scena"}
            </button>
          </div>
          {s.images.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {s.images.map((img) => (
                <button
                  key={img}
                  onClick={() => onChange({ selectedImage: img })}
                  className={`overflow-hidden rounded-xl border-4 ${s.selectedImage === img ? "border-orange-500" : "border-transparent"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(img)} alt="" className="w-full" />
                </button>
              ))}
            </div>
          )}
          {s.video && (
            <video src={fileUrl(s.video)} controls className={`w-full rounded-xl ${ep.aspect === "9:16" ? "max-h-96" : ""}`} />
          )}
        </div>
      </div>

      {/* Battute */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="label">Battute</div>
          <button
            className="btn-secondary text-xs"
            disabled={!!busy}
            onClick={() => onRun(k("voice"), { action: "voices", scene: s.number }, `Voci della scena ${s.number} pronte ✓`)}
          >
            {busy === k("voice") ? "Genero…" : "🎙️ Voci di questa scena"}
          </button>
        </div>
        {s.lines.map((l, i) => (
          <div key={i} className="grid items-start gap-2 md:grid-cols-[10rem_1fr_auto]">
            <select className="input" value={l.speaker} onChange={(e) => setLine(i, { speaker: e.target.value, audio: undefined })}>
              {[...new Set([...speakers, l.speaker])].map((sp) => (
                <option key={sp}>{sp}</option>
              ))}
            </select>
            <div className="space-y-1">
              <textarea
                className="input min-h-10"
                rows={2}
                value={l.text}
                onChange={(e) => setLine(i, { text: e.target.value, audio: undefined })}
              />
              {l.audio && <audio src={fileUrl(l.audio)} controls className="h-8 w-full" />}
            </div>
            <button className="btn-danger" onClick={() => onChange({ lines: s.lines.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn-secondary text-xs" onClick={() => onChange({ lines: [...s.lines, { speaker: "NARRATORE", text: "" }] })}>
          + Battuta
        </button>
      </div>
    </div>
  );
}

function SocialCard({ social, onChange }: { social: SocialTexts; onChange: (s: SocialTexts) => void }) {
  const fields: { k: keyof Omit<SocialTexts, "hashtags">; label: string; rows: number }[] = [
    { k: "youtubeTitle", label: "YouTube — titolo", rows: 1 },
    { k: "youtubeDescription", label: "YouTube — descrizione", rows: 5 },
    { k: "tiktok", label: "TikTok (per i genitori)", rows: 3 },
    { k: "instagram", label: "Instagram (per i genitori)", rows: 3 },
    { k: "facebook", label: "Facebook (genitori e insegnanti)", rows: 3 },
  ];
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Testi per i social</h2>
      {fields.map((f) => (
        <div key={f.k}>
          <label className="label">{f.label}</label>
          <textarea className="input" rows={f.rows} value={social[f.k]} onChange={(e) => onChange({ ...social, [f.k]: e.target.value })} />
        </div>
      ))}
      <div>
        <label className="label">Hashtag</label>
        <input
          className="input"
          value={social.hashtags.join(" ")}
          onChange={(e) => onChange({ ...social, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
        />
      </div>
    </div>
  );
}
