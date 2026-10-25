import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import AskButton from "@/components/AskButton";
import { getSettings } from "@/lib/settings";
import { listCharacters, listEpisodes } from "@/lib/storage";

const FLOW = [
  { n: 1, icon: "◉", title: "Personaggi", text: "Aspetto preciso + 3 immagini di riferimento + voce", q: "Spiegami bene come preparare un personaggio" },
  { n: 2, icon: "✍", title: "Sceneggiatura", text: "Claude scrive scene, battute, quiz e testi social", q: "Come funziona la sceneggiatura con Claude?" },
  { n: 3, icon: "✓", title: "Revisione", text: "Un insegnante controlla i contenuti (obbligatorio)", q: "Perché la revisione didattica è obbligatoria e come la organizzo?" },
  { n: 4, icon: "▣", title: "Immagini", text: "2 varianti per scena, scegli la migliore", q: "Come ottengo immagini belle e coerenti?" },
  { n: 5, icon: "▶", title: "Clip AI", text: "Solo 1–2 scene \"wow\" per episodio", q: "Quando conviene usare il video AI?" },
  { n: 6, icon: "♪", title: "Voci", text: "Narratore + una voce per personaggio", q: "Come scelgo e collego le voci?" },
  { n: 7, icon: "⇩", title: "Export", text: "Pacchetto per il montatore + n8n", q: "Cosa c'è nel pacchetto export e cosa ci fa il montatore?" },
];

async function Status() {
  await connection();
  const [s, chars, eps] = await Promise.all([getSettings(), listCharacters(), listEpisodes()]);
  const checks = [
    { ok: !!s.anthropicApiKey, label: "Claude" },
    { ok: !!s.falKey, label: "fal.ai" },
    { ok: !!s.elevenLabsApiKey, label: "ElevenLabs" },
    { ok: !!s.narratorVoiceId, label: "Voce narratore" },
    { ok: chars.some((c) => c.references.length >= 3), label: "Personaggio pronto" },
  ];
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {checks.map((c) => (
          <span key={c.label} className={c.ok ? "chip-on" : "chip"}>
            {c.ok ? "●" : "○"} {c.label}
          </span>
        ))}
      </div>
      {eps.length > 0 && (
        <div className="mt-6">
          <div className="label">Episodi recenti</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {eps.slice(0, 6).map((e) => (
              <Link key={e.id} href={`/episodi/${e.id}`} className="panel p-4 transition hover:border-accent/50">
                <div className="font-mono text-[11px] text-muted">{e.code}</div>
                <div className="mt-1 font-semibold">{e.title ?? e.topic}</div>
                <div className="muted mt-1 text-xs">
                  {e.grade} · {e.subject} · {e.scenes.length} scene
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#16181a] via-[#121215] to-[#0f1512] p-6 md:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="text-xs font-semibold tracking-widest text-accent uppercase">Studio · Storie di Scuola</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Cosa creiamo oggi?</h1>
        <p className="muted mt-2 max-w-xl">
          Dal programma scolastico al video: personaggi, storie, immagini e voci in un unico posto. Se hai un dubbio, l&apos;assistente ti
          accompagna in ogni passaggio.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link href="/episodi" className="panel group p-4 transition hover:border-accent/60">
            <div className="text-2xl">🎬</div>
            <div className="mt-2 font-semibold group-hover:text-accent">Nuovo episodio</div>
            <div className="muted text-xs">Argomento → sceneggiatura → scene</div>
          </Link>
          <Link href="/personaggi" className="panel group p-4 transition hover:border-accent/60">
            <div className="text-2xl">🦉</div>
            <div className="mt-2 font-semibold group-hover:text-accent">Nuovo personaggio</div>
            <div className="muted text-xs">Design, riferimenti e voce</div>
          </Link>
          <AskButton q="Da dove comincio? Guidami passo passo" className="panel group p-4 text-left transition hover:border-accent/60">
            <div className="text-2xl">✨</div>
            <div className="mt-2 font-semibold group-hover:text-accent">Guidami tu</div>
            <div className="muted text-xs">L&apos;assistente controlla cosa manca</div>
          </AskButton>
        </div>
      </section>

      <section>
        <div className="label">Stato</div>
        <Suspense fallback={<p className="muted">Controllo…</p>}>
          <Status />
        </Suspense>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="label">Il flusso di un episodio</div>
            <p className="muted text-xs">Clicca un passaggio per fartelo spiegare dall&apos;assistente</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {FLOW.map((f) => (
            <AskButton key={f.n} q={f.q} className="panel group relative p-4 text-left transition hover:border-accent/60">
              <div className="flex items-center justify-between">
                <span className="text-xl text-accent">{f.icon}</span>
                <span className="font-mono text-[11px] text-muted">0{f.n}</span>
              </div>
              <div className="mt-3 text-sm font-semibold group-hover:text-accent">{f.title}</div>
              <div className="muted mt-1 text-xs leading-snug">{f.text}</div>
            </AskButton>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <div className="label">Regole d&apos;oro</div>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>• Niente testo dentro le immagini: titoli e numeri si aggiungono al montaggio.</li>
            <li>• Controlla sempre mani, volti, dettagli storici e scientifici.</li>
            <li>• Lo stile visivo resta identico per tutto il canale.</li>
            <li>• Video AI solo per i momenti &quot;wow&quot;: è la voce più cara.</li>
          </ul>
        </div>
        <div className="card">
          <div className="label">Costi indicativi</div>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>• Sceneggiatura: ~0,15 $</li>
            <li>• Immagine: ~0,15 $ (12 scene × 2 varianti ≈ 3–4 $)</li>
            <li>• Clip video 5 s: ~0,40 $</li>
            <li>• Voci di un episodio di 5 min: ~1 $ (dipende dal piano ElevenLabs)</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
