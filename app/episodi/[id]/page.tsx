"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fileUrl } from "@/lib/client";
import { COST, usd, voiceCost } from "@/lib/costs";
import { askAssistant, REFRESH_EVENT, setUiContext } from "@/lib/ui-bus";
import type { Character, Episode, Scene, SocialTexts } from "@/lib/types";

type Loaded = { ep: Episode; chars: Character[] };

export default function EpisodeEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ep, setEp] = useState<Episode | null>(null);
  const [chars, setChars] = useState<Character[]>([]);
  const [current, setCurrent] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"scene" | "quiz" | "social">("scene");
  const epRef = useRef<Episode | null>(null);
  useEffect(() => {
    epRef.current = ep;
  }, [ep]);

  const reload = useCallback(() => {
    api<Loaded>(`/api/episodes/${id}`)
      .then((r) => {
        setEp(r.ep);
        setChars(r.chars);
        setDirty(false);
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  // L'assistente può modificare l'episodio: ricarica quando lo chiede (se non ci sono modifiche in sospeso)
  useEffect(() => {
    const onRefresh = () => {
      if (!dirty) reload();
    };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [dirty, reload]);

  // Dice all'assistente dove si trova l'utente
  useEffect(() => {
    setUiContext({ episodeId: id, scene: ep?.scenes.length ? current : undefined });
    return () => setUiContext({});
  }, [id, current, ep?.scenes.length]);

  // Salvataggio automatico 1 secondo dopo l'ultima modifica
  const save = useCallback(async () => {
    if (!epRef.current) return;
    setSaving(true);
    try {
      await api(`/api/episodes/${id}`, { json: { action: "save", episode: epRef.current } });
      setDirty(false);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(save, 1000);
    return () => clearTimeout(t);
  }, [dirty, ep, save]);

  const update = (patch: Partial<Episode>) => {
    setEp((e) => (e ? { ...e, ...patch } : e));
    setDirty(true);
  };
  const updateScene = (n: number, patch: Partial<Scene>) =>
    update({ scenes: ep!.scenes.map((s) => (s.number === n ? { ...s, ...patch } : s)) });

  async function run(key: string, body: Record<string, unknown>, okText?: string) {
    setBusy(key);
    setMsg(null);
    try {
      if (dirty) await save();
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

  const scene = ep.scenes.find((s) => s.number === current) ?? ep.scenes[0];
  const allLines = ep.scenes.flatMap((s) => s.lines);
  const voiced = allLines.filter((l) => l.audio).length;
  const withImage = ep.scenes.filter((s) => s.selectedImage).length;
  const totalSec = ep.scenes.reduce((a, s) => a + (Number(s.durationSec) || 0), 0);
  const speakers = ["NARRATORE", ...chars.map((c) => c.name)];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      {/* Barra superiore */}
      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <Link href="/episodi" className="chip">
          ← Episodi
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] text-muted">
            {ep.code} · {ep.grade} · {ep.subject} · {ep.aspect}
            {ep.sourceFile && (
              <>
                {" · "}
                <a className="text-accent underline" href={fileUrl(ep.sourceFile)} target="_blank">
                  materiale
                </a>
              </>
            )}
          </div>
          <input
            className="w-full bg-transparent text-lg font-bold outline-none"
            value={ep.title ?? ep.topic}
            onChange={(e) => update({ title: e.target.value })}
          />
        </div>
        <span className="text-[11px] text-muted">{saving ? "Salvataggio…" : dirty ? "Modifiche non salvate" : "✓ Salvato"}</span>
        {ep.scenes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="chip">{Math.round(totalSec / 6) / 10} min</span>
            <span className={withImage === ep.scenes.length ? "chip-on" : "chip"}>
              ▣ {withImage}/{ep.scenes.length}
            </span>
            <span className={voiced === allLines.length && voiced > 0 ? "chip-on" : "chip"}>
              ♪ {voiced}/{allLines.length}
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {ep.scenes.length > 0 && (
            <>
              <button
                className="btn-secondary"
                disabled={!!busy}
                onClick={() =>
                  confirm("Rigenerare la sceneggiatura? Scene, immagini e voci attuali verranno sostituite.") &&
                  run("script", { action: "script" }, "Nuova sceneggiatura pronta ✓")
                }
              >
                {busy === "script" ? "Scrivo…" : "↻ Sceneggiatura"}
              </button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => run("voices", { action: "voices" }, "Voci generate ✓")}>
                {busy === "voices" ? "Genero voci…" : `♪ Tutte le voci · ${usd(voiceCost(allLines.map((l) => l.text).join(" ")))}`}
              </button>
              <button className="btn" disabled={!!busy} onClick={() => run("export", { action: "export" })}>
                {busy === "export" ? "Esporto…" : "⇩ Esporta"}
              </button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => run("n8n", { action: "n8n" }, "Inviato a n8n ✓")}>
                {busy === "n8n" ? "Invio…" : "n8n"}
              </button>
            </>
          )}
          <button className="btn-danger" onClick={remove}>
            Elimina
          </button>
        </div>
      </div>

      {msg && <div className={`${msg.ok ? "msg-ok" : "msg-err"} break-all`}>{msg.text}</div>}

      {ep.scenes.length === 0 ? (
        <div className="panel flex flex-col items-center gap-4 p-10 text-center">
          <div className="text-4xl">✍️</div>
          <div className="text-xl font-semibold">Partiamo dalla sceneggiatura</div>
          <p className="muted max-w-lg">
            Claude scriverà la storia divisa in scene, con narratore, dialoghi tra i personaggi, i prompt per le immagini, il quiz e i testi per
            i social. Dopo potrai correggere tutto.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn px-6 py-3 text-base" disabled={!!busy} onClick={() => run("script", { action: "script" }, "Sceneggiatura pronta ✓ — ora serve la revisione didattica.")}>
              {busy === "script" ? "Claude sta scrivendo… (1-2 min)" : `✍️ Genera sceneggiatura · ${usd(COST.script)}`}
            </button>
            <button className="btn-secondary" onClick={() => askAssistant("Prima di generare la sceneggiatura, cosa devo controllare in questo episodio?")}>
              ✨ Chiedi prima all&apos;assistente
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            {(
              [
                ["scene", "Scene"],
                ["quiz", "Obiettivi e quiz"],
                ["social", "Testi social"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={tab === k ? "chip-on" : "chip"} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>

          {tab === "scene" && scene && (
            <div className="grid gap-4 xl:grid-cols-[220px_1fr_340px] lg:grid-cols-[200px_1fr]">
              <SceneList
                ep={ep}
                current={scene.number}
                onSelect={setCurrent}
                onAdd={() => {
                  const n = ep.scenes.length + 1;
                  update({
                    scenes: [
                      ...ep.scenes,
                      {
                        number: n,
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
                  });
                  setCurrent(n);
                }}
              />
              <Stage ep={ep} s={scene} speakers={speakers} busy={busy} onChange={(p) => updateScene(scene.number, p)} onRun={run} />
              <GeneratePanel
                key={scene.number}
                ep={ep}
                s={scene}
                chars={chars}
                busy={busy}
                onChange={(p) => updateScene(scene.number, p)}
                onRun={run}
                onDelete={() => {
                  if (!confirm(`Eliminare la scena ${scene.number}?`)) return;
                  update({ scenes: ep.scenes.filter((x) => x.number !== scene.number).map((x, i) => ({ ...x, number: i + 1 })) });
                  setCurrent(Math.max(1, scene.number - 1));
                }}
              />
            </div>
          )}

          {tab === "quiz" && <QuizTab ep={ep} update={update} />}
          {tab === "social" && ep.social && <SocialTab social={ep.social} onChange={(social) => update({ social })} />}
        </>
      )}
    </div>
  );
}

function SceneList({ ep, current, onSelect, onAdd }: { ep: Episode; current: number; onSelect: (n: number) => void; onAdd: () => void }) {
  return (
    <div className="panel flex max-h-[78vh] gap-2 overflow-auto p-2 lg:flex-col">
      {ep.scenes.map((s) => (
        <button
          key={s.number}
          onClick={() => onSelect(s.number)}
          className={`w-40 shrink-0 rounded-xl border p-1.5 text-left transition lg:w-full ${
            s.number === current ? "border-accent/70 bg-accent/5" : "border-transparent hover:bg-panel-2"
          }`}
        >
          <div className={`relative overflow-hidden rounded-lg bg-panel-2 ${ep.aspect === "9:16" ? "aspect-[9/16] max-h-40" : "aspect-video"}`}>
            {s.selectedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(s.selectedImage)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">nessuna immagine</div>
            )}
            <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 font-mono text-[10px]">{String(s.number).padStart(2, "0")}</span>
            <div className="absolute right-1 bottom-1 flex gap-1 text-[10px]">
              {s.useAiVideo && <span className={`rounded px-1 ${s.video ? "bg-accent text-black" : "bg-black/70"}`}>▶</span>}
              <span className={`rounded px-1 ${s.lines.length && s.lines.every((l) => l.audio) ? "bg-accent text-black" : "bg-black/70"}`}>♪</span>
            </div>
          </div>
          <div className="mt-1 truncate px-0.5 text-xs font-medium">{s.title}</div>
          <div className="px-0.5 text-[10px] text-muted">{s.durationSec}s</div>
        </button>
      ))}
      <button className="chip shrink-0" onClick={onAdd}>
        + Scena
      </button>
    </div>
  );
}

function Stage(props: {
  ep: Episode;
  s: Scene;
  speakers: string[];
  busy: string;
  onChange: (p: Partial<Scene>) => void;
  onRun: (key: string, body: Record<string, unknown>, okText?: string) => void;
}) {
  const { ep, s, speakers, busy, onChange, onRun } = props;
  const [view, setView] = useState<"image" | "video">("image");
  const showVideo = view === "video" && s.video;
  const setLine = (i: number, patch: Partial<Scene["lines"][number]>) =>
    onChange({ lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const sceneVoiceCost = voiceCost(s.lines.map((l) => l.text).join(" "));

  return (
    <div className="min-w-0 space-y-4">
      <div className="panel p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">
            <span className="mr-2 font-mono text-accent">{String(s.number).padStart(2, "0")}</span>
            {s.title}
          </div>
          {s.video && (
            <div className="flex gap-1">
              <button className={view === "image" ? "chip-on" : "chip"} onClick={() => setView("image")}>
                Immagine
              </button>
              <button className={view === "video" ? "chip-on" : "chip"} onClick={() => setView("video")}>
                Clip
              </button>
            </div>
          )}
        </div>
        <div
          className={`mx-auto flex items-center justify-center overflow-hidden rounded-xl bg-black ${ep.aspect === "9:16" ? "aspect-[9/16] max-h-[60vh]" : "aspect-video"}`}
        >
          {showVideo ? (
            <video src={fileUrl(s.video!)} controls autoPlay loop className="h-full w-full object-contain" />
          ) : s.selectedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(s.selectedImage)} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="p-6 text-center text-sm text-muted">
              {busy === `img-${s.number}` ? "Generazione in corso…" : "Nessuna immagine: usa il pannello Genera →"}
            </div>
          )}
        </div>
        {s.images.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {s.images.map((img) => (
              <button
                key={img}
                onClick={() => {
                  onChange({ selectedImage: img });
                  setView("image");
                }}
                className={`shrink-0 overflow-hidden rounded-lg border-2 ${s.selectedImage === img ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(img)} alt="" className={ep.aspect === "9:16" ? "h-28" : "h-20"} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="label mb-0">Battute</div>
          <button
            className="btn-secondary text-xs"
            disabled={!!busy || s.lines.length === 0}
            onClick={() => onRun(`voice-${s.number}`, { action: "voices", scene: s.number }, `Voci della scena ${s.number} pronte ✓`)}
          >
            {busy === `voice-${s.number}` ? "Genero…" : `♪ Voci della scena · ${usd(sceneVoiceCost)}`}
          </button>
        </div>
        {s.lines.map((l, i) => (
          <div key={i} className="grid items-start gap-2 rounded-xl bg-panel-2 p-2 md:grid-cols-[9rem_1fr_auto]">
            <select className="input" value={l.speaker} onChange={(e) => setLine(i, { speaker: e.target.value, audio: undefined })}>
              {[...new Set([...speakers, l.speaker])].map((sp) => (
                <option key={sp}>{sp}</option>
              ))}
            </select>
            <div className="space-y-1">
              <textarea className="input min-h-10" rows={2} value={l.text} onChange={(e) => setLine(i, { text: e.target.value, audio: undefined })} />
              {l.audio && <audio src={fileUrl(l.audio)} controls className="h-8 w-full" />}
            </div>
            <button className="btn-danger" onClick={() => onChange({ lines: s.lines.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="chip" onClick={() => onChange({ lines: [...s.lines, { speaker: "NARRATORE", text: "" }] })}>
          + Battuta
        </button>
      </div>
    </div>
  );
}

function GeneratePanel(props: {
  ep: Episode;
  s: Scene;
  chars: Character[];
  busy: string;
  onChange: (p: Partial<Scene>) => void;
  onRun: (key: string, body: Record<string, unknown>, okText?: string) => void;
  onDelete: () => void;
}) {
  const { ep, s, chars, busy, onChange, onRun, onDelete } = props;
  const [count, setCount] = useState(2);
  const [duration, setDuration] = useState(5);
  const inScene = (c: Character) => s.characters.some((n) => n.toLowerCase() === c.name.toLowerCase());
  const refsUsed = chars.filter(inScene).reduce((a, c) => a + Math.min(3, c.references.length), 0);

  return (
    <div className="space-y-4 lg:col-span-2 xl:col-span-1">
      <div className="panel space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">▣ Immagine</div>
          <button className="text-[11px] text-accent" onClick={() => askAssistant(`Migliora il prompt dell'immagine della scena ${s.number}`)}>
            ✨ migliora prompt
          </button>
        </div>
        <div>
          <label className="label">Prompt (inglese)</label>
          <textarea
            className="input min-h-32 font-mono text-xs leading-relaxed"
            value={s.imagePrompt}
            onChange={(e) => onChange({ imagePrompt: e.target.value })}
            placeholder="Describe the shot, place, action and characters…"
          />
        </div>
        <div>
          <label className="label">Personaggi in scena</label>
          <div className="flex flex-wrap gap-1.5">
            {chars.length === 0 && <span className="muted text-xs">Nessun personaggio collegato all&apos;episodio</span>}
            {chars.map((c) => {
              const on = inScene(c);
              return (
                <button
                  key={c.id}
                  className={on ? "chip-on" : "chip"}
                  onClick={() =>
                    onChange({ characters: on ? s.characters.filter((n) => n.toLowerCase() !== c.name.toLowerCase()) : [...s.characters, c.name] })
                  }
                >
                  {c.name}
                  {c.references.length === 0 && " ⚠"}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {refsUsed > 0 ? `Uso ${refsUsed} immagini di riferimento per tenere i personaggi uguali.` : "Senza riferimenti: personaggi non garantiti coerenti."}
          </p>
        </div>
        <div>
          <label className="label">Varianti</label>
          <div className="flex gap-1.5">
            {[1, 2, 4].map((n) => (
              <button key={n} className={count === n ? "chip-on" : "chip"} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
            <span className="chip ml-auto">{ep.aspect}</span>
          </div>
        </div>
        <button
          className="btn w-full py-3"
          disabled={!!busy || !s.imagePrompt.trim()}
          onClick={() => onRun(`img-${s.number}`, { action: "images", scene: s.number, count }, "Immagini pronte ✓ — scegli la migliore")}
        >
          {busy === `img-${s.number}` ? "Genero… (~30 s)" : `Genera · ${usd(count * COST.image)}`}
        </button>
      </div>

      <div className="panel space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">▶ Clip animata</div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input type="checkbox" checked={s.useAiVideo} onChange={(e) => onChange({ useAiVideo: e.target.checked })} />
            scena &quot;wow&quot;
          </label>
        </div>
        <div>
          <label className="label">Movimento</label>
          <input className="input" value={s.motion} onChange={(e) => onChange({ motion: e.target.value })} placeholder="Es. zoom lento, il gufo apre le ali" />
        </div>
        <div>
          <label className="label">Durata</label>
          <div className="flex gap-1.5">
            {[5, 10].map((d) => (
              <button key={d} className={duration === d ? "chip-on" : "chip"} onClick={() => setDuration(d)}>
                {d}s
              </button>
            ))}
          </div>
        </div>
        <button
          className="btn-secondary w-full py-3"
          disabled={!!busy || !s.selectedImage}
          onClick={() => onRun(`vid-${s.number}`, { action: "video", scene: s.number, duration }, "Clip pronta ✓")}
        >
          {busy === `vid-${s.number}` ? "Animo… (1-3 min)" : s.selectedImage ? `Anima · ${usd(duration * COST.videoPerSec)}` : "Prima scegli un'immagine"}
        </button>
        {!s.useAiVideo && <p className="text-[11px] text-muted">Consiglio: usa la clip AI solo nelle 1–2 scene più spettacolari.</p>}
      </div>

      <div className="panel space-y-3 p-4">
        <div className="text-sm font-semibold">Dettagli scena</div>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <input className="input" value={s.title} onChange={(e) => onChange({ title: e.target.value })} />
          <input type="number" className="input" value={s.durationSec} onChange={(e) => onChange({ durationSec: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">Storyboard</label>
          <textarea className="input min-h-16" value={s.visual} onChange={(e) => onChange({ visual: e.target.value })} />
        </div>
        <button className="btn-danger w-full" onClick={onDelete}>
          Elimina scena
        </button>
      </div>
    </div>
  );
}

function QuizTab({ ep, update }: { ep: Episode; update: (p: Partial<Episode>) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel p-4">
        <div className="label">Obiettivi di apprendimento</div>
        <ul className="space-y-1 text-sm text-zinc-300">
          {(ep.learningObjectives ?? []).map((o) => (
            <li key={o}>• {o}</li>
          ))}
        </ul>
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          ✓ Prima di generare immagini e voci, fai controllare la sceneggiatura a un insegnante. La firma va nel file sceneggiatura.md
          dell&apos;export.
        </div>
      </div>
      <div className="panel space-y-2 p-4">
        <div className="label">Quiz</div>
        {(ep.quiz ?? []).map((q, i) => (
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
    </div>
  );
}

function SocialTab({ social, onChange }: { social: SocialTexts; onChange: (s: SocialTexts) => void }) {
  const fields: { k: keyof Omit<SocialTexts, "hashtags">; label: string; rows: number }[] = [
    { k: "youtubeTitle", label: "YouTube — titolo", rows: 1 },
    { k: "youtubeDescription", label: "YouTube — descrizione", rows: 6 },
    { k: "tiktok", label: "TikTok (per i genitori)", rows: 3 },
    { k: "instagram", label: "Instagram (per i genitori)", rows: 3 },
    { k: "facebook", label: "Facebook (genitori e insegnanti)", rows: 3 },
  ];
  return (
    <div className="panel grid gap-4 p-4 lg:grid-cols-2">
      {fields.map((f) => (
        <div key={f.k} className={f.k === "youtubeDescription" ? "lg:row-span-2" : ""}>
          <label className="label">{f.label}</label>
          <textarea className="input" rows={f.rows} value={social[f.k]} onChange={(e) => onChange({ ...social, [f.k]: e.target.value })} />
        </div>
      ))}
      <div className="lg:col-span-2">
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
