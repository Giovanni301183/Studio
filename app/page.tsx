import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSettings } from "@/lib/settings";
import { listCharacters, listEpisodes } from "@/lib/storage";

const STEPS = [
  {
    title: "1. Collega i servizi",
    href: "/impostazioni",
    cta: "Apri Impostazioni",
    body: [
      "Anthropic (Claude) scrive le sceneggiature: console.anthropic.com → API Keys.",
      "fal.ai genera immagini e video con molti modelli (Nano Banana Pro, Kling…): fal.ai → Dashboard → Keys.",
      "ElevenLabs crea le voci in italiano: elevenlabs.io → Profilo → API Keys. Nella Voice Library scegli una voce per il narratore e una per ogni personaggio.",
    ],
  },
  {
    title: "2. Crea i personaggi",
    href: "/personaggi",
    cta: "Vai ai Personaggi",
    body: [
      "Scrivi nome, ruolo e un aspetto molto preciso (colori, vestiti, proporzioni): è quello che rende i personaggi coerenti.",
      "Carica i disegni dell'illustratore oppure premi \"Proposte\" per farne generare 4 dall'AI e promuovi la migliore a riferimento.",
      "Genera la scheda di rotazione (fronte, lato, retro) e la scheda espressioni, poi aggiungile ai riferimenti. Più riferimenti buoni = immagini più coerenti.",
      "Importante per i diritti: ritocca a mano (o fai ritoccare) i personaggi principali prima di usarli come marchio.",
    ],
  },
  {
    title: "3. Imposta lo stile",
    href: "/impostazioni",
    cta: "Stile visivo",
    body: [
      "Lo \"stile visivo\" viene aggiunto a ogni immagine: tienilo identico per tutto il canale.",
      "Fai qualche prova, scegli la versione che ti piace e non cambiarla più (salvo nuove serie).",
    ],
  },
  {
    title: "4. Crea un episodio e la sceneggiatura",
    href: "/episodi",
    cta: "Nuovo episodio",
    body: [
      "Scegli classe, materia, argomento e personaggi. Puoi caricare materiale: PDF, foto della pagina del libro, appunti in .txt.",
      "Premi \"Genera sceneggiatura\": Claude crea scene, battute, prompt per le immagini, quiz e testi per i social.",
      "Correggi tutto quello che vuoi direttamente nell'editor. Poi la revisione didattica dell'insegnante è obbligatoria prima di andare avanti.",
    ],
  },
  {
    title: "5. Immagini, voci e scene animate",
    body: [
      "Per ogni scena: \"Genera immagini\" crea 2 varianti usando i riferimenti dei personaggi presenti. Scegli la migliore (bordo arancione).",
      "Se un'immagine non va bene, modifica il prompt della scena e rigenera: costa pochi centesimi.",
      "\"Genera tutte le voci\" crea un mp3 per ogni battuta con la voce del personaggio.",
      "Solo per le scene segnate come VIDEO AI: \"Anima scena\" crea una clip di 5-10 secondi. Costa di più: usala per i momenti \"wow\".",
      "Controlla sempre: mani, volti, dettagli storici e scientifici. L'AI sbaglia, e per i bambini non si può sbagliare.",
    ],
  },
  {
    title: "6. Esporta per il montaggio",
    body: [
      "\"Esporta pacchetto\" crea una cartella con immagini, video e audio numerati per scena, la sceneggiatura e i sottotitoli .srt.",
      "Il montatore la apre in CapCut, DaVinci Resolve o Premiere, anima i personaggi (parallasse, labiale con Cartoon Animator/Character Animator) e riallinea i sottotitoli.",
      "Il file episodio.json contiene tutti i testi social: è pensato per il flusso n8n di pubblicazione.",
    ],
  },
  {
    title: "7. Collega n8n",
    href: "/impostazioni",
    cta: "Webhook n8n",
    body: [
      "In n8n crea un workflow con un nodo Webhook (POST) e incolla il suo URL nelle Impostazioni.",
      "\"Invia a n8n\" manda l'episodio con i testi per ogni piattaforma: da lì n8n chiede l'approvazione, programma e pubblica secondo la griglia dell'AGENDA_PRODUZIONE.md.",
    ],
  },
];

// Legge i file locali a ogni richiesta, quindi non va pre-renderizzato
async function SetupStatus() {
  await connection();
  const [s, chars, eps] = await Promise.all([getSettings(), listCharacters(), listEpisodes()]);
  const checks = [
    { ok: Boolean(s.anthropicApiKey), label: "Claude collegato" },
    { ok: Boolean(s.falKey), label: "fal.ai collegato" },
    { ok: Boolean(s.elevenLabsApiKey), label: "ElevenLabs collegato" },
    { ok: Boolean(s.narratorVoiceId), label: "Voce del narratore" },
    { ok: chars.length > 0, label: `Personaggi (${chars.length})` },
    { ok: chars.some((c) => c.references.length >= 3), label: "Almeno 1 personaggio con 3+ riferimenti" },
    { ok: eps.length > 0, label: `Episodi (${eps.length})` },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {checks.map((c) => (
        <span
          key={c.label}
          className={`rounded-full px-3 py-1 text-sm ${c.ok ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-500"}`}
        >
          {c.ok ? "✓" : "○"} {c.label}
        </span>
      ))}
    </div>
  );
}

export default function Guide() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Guida al backstage</h1>
        <p className="muted mt-1">
          Dal materiale scolastico al pacchetto pronto per il montaggio: segui i passi in ordine la prima volta.
        </p>
      </div>

      <div className="card">
        <div className="label">Stato della configurazione</div>
        <Suspense fallback={<p className="muted mt-2">Controllo…</p>}>
          <SetupStatus />
        </Suspense>
      </div>

      <div className="card overflow-x-auto">
        <div className="label">Il flusso</div>
        <pre className="mt-2 text-xs leading-relaxed text-stone-700">{`Materiale (PDF/foto/appunti) + Personaggi + Stile
        │
        ▼
 Claude ──► Sceneggiatura (scene, battute, prompt, quiz, testi social)
        │        └─► ✅ revisione didattica (persona)
        ▼
 fal.ai ──► Immagini di ogni scena (coerenti con i riferimenti)
        │   └─► Kling: clip animate per le scene "wow"
        ▼
 ElevenLabs ──► Voci (narratore + personaggi)
        │
        ▼
 Pacchetto export ──► Montaggio (persona) ──► n8n ──► YouTube · Facebook · Instagram · TikTok`}</pre>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {STEPS.map((step) => (
          <div key={step.title} className="card">
            <h2 className="font-semibold text-stone-900">{step.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
              {step.body.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {step.href && (
              <Link href={step.href} className="btn-secondary mt-3">
                {step.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="label">Costi indicativi (da verificare sui listini)</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
          <li>Sceneggiatura con Claude: pochi centesimi per episodio.</li>
          <li>Immagini: qualche centesimo ciascuna; un episodio con 12 scene × 2 varianti ≈ 1–4 €.</li>
          <li>Voci: dipende dal piano ElevenLabs (caratteri al mese); un episodio di 5 minuti ≈ 4–5.000 caratteri.</li>
          <li>Video AI: è la voce più cara (circa 0,3–1 € a clip). Limitala a 1–2 scene per episodio.</li>
        </ul>
      </div>
    </div>
  );
}
