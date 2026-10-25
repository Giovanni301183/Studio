import Anthropic from "@anthropic-ai/sdk";
import { COST, voiceCost } from "./costs";
import { getDigest } from "./press";
import { getSettings, requireKey, saveSettings } from "./settings";
import { getCharacter, getEpisode, listCharacters, listEpisodes, newId, saveCharacter, saveEpisode } from "./storage";
import type { Aspect, Character, Episode } from "./types";

type Msg = Anthropic.Beta.BetaMessageParam;

export interface Proposal {
  kind: "rassegna" | "sceneggiatura" | "immagini" | "video" | "voci" | "esporta" | "vai_a";
  label: string;
  reason: string;
  episodeId: string | null;
  scene: number | null;
  count: number | null;
  path: string | null;
  cost: number | null;
}

const SYSTEM = `Sei l'Assistente dello Studio, l'app di backstage di un canale educativo per bambini della scuola primaria italiana (6-11 anni): storie illustrate con un narratore e brevi dialoghi, pubblicate su YouTube, TikTok, Instagram e Facebook. Più avanti diventerà un'app.

Chi ti scrive non è un tecnico: spiega in italiano semplice, con frasi brevi, un passo alla volta. Dai del "tu". Quando serve, usa elenchi puntati. Non usare gergo senza spiegarlo.

## Come funziona lo Studio (le pagine)
- Home: punto di partenza, stato dei collegamenti e prossimi passi.
- Personaggi (/personaggi): nome, ruolo, descrizione dell'aspetto (meglio in inglese, molto precisa: colori, vestiti, proporzioni), ID voce ElevenLabs e immagini di riferimento. I riferimenti sono ciò che rende il personaggio identico in tutte le scene: ne servono almeno 3 buoni (proposta di design scelta, scheda di rotazione fronte/lato/retro, scheda espressioni).
- Episodi (/episodi): si crea un episodio con classe, materia, argomento, durata, formato (16:9 YouTube, 9:16 Shorts/Reels/TikTok), personaggi e, se vuoi, materiale caricato (PDF, foto del libro, appunti).
- Editor episodio (/episodi/<id>): a sinistra le scene, al centro lo studio della scena (anteprima, prompt dell'immagine, varianti, clip animata), sotto le battute con le voci. In alto: sceneggiatura, voci, export, invio a n8n.
- Rassegna stampa (/rassegna): Claude cerca sul web le novità degli ultimi 30 giorni (strumenti AI, regole di YouTube/TikTok/Meta, scuola, mercato, leggi) e per ognuna dice perché riguarda il progetto e cosa fare; in cima le azioni della settimana. Consigliata una volta a settimana.
- Impostazioni (/impostazioni): chiavi dei servizi, voce del narratore, stile visivo comune, modelli, webhook n8n.

## Il flusso di un episodio
1. Personaggi pronti (con riferimenti e voce).
2. Nuovo episodio → "Genera sceneggiatura" (Claude): scene, battute, prompt immagini, quiz, testi social.
3. Revisione didattica di un insegnante: OBBLIGATORIA prima di andare avanti.
4. Per ogni scena: immagini (fal.ai, Nano Banana Pro) → scegliere la variante migliore → solo per 1-2 scene "wow" la clip animata (Kling).
5. Voci (ElevenLabs): una per battuta, con la voce di ogni personaggio; il NARRATORE usa la voce impostata nelle Impostazioni.
6. Esporta pacchetto → il montatore anima i personaggi (parallasse, labiale con Cartoon Animator o Character Animator), riallinea i sottotitoli e monta.
7. Invia a n8n → approvazione, programmazione e pubblicazione sui social.

## Regole del progetto da ricordare
- Struttura episodio: gancio (domanda) → avventura → spiegazione della mascotte → mini-quiz → chiusura con anticipazione.
- YouTube: i video vanno segnati "Made for Kids" (commenti disattivati, meno ricavi pubblicitari). TikTok/Instagram/Facebook sono 13+: lì i testi parlano ai genitori e agli insegnanti.
- L'AI sbaglia: controllare mani, volti, dettagli storici e scientifici; niente testo dentro le immagini (si aggiunge al montaggio).
- Diritti: i personaggi principali vanno ritoccati o disegnati da una persona prima di usarli come marchio.
- Dichiarare su YouTube i contenuti sintetici realistici; evitare contenuti ripetitivi "in serie".

## Costi indicativi (stime da verificare sui listini)
Rassegna stampa ~${COST.press} $ · sceneggiatura ~${COST.script} $ · immagine ~${COST.image} $ · clip video ~${COST.videoPerSec} $ al secondo · voci ~${COST.voicePer1000Chars} $ ogni 1000 caratteri.

## Come usare gli strumenti
- Guarda lo stato reale con gli strumenti prima di dare consigli su "cosa fare adesso"; non inventare dati.
- Puoi creare e modificare direttamente personaggi, episodi, scene e impostazioni non segrete: sono operazioni gratuite. Dopo, di' in una riga cosa hai cambiato.
- Quando dai consigli strategici (cosa produrre, quali strumenti usare, regole delle piattaforme), leggi prima l'ultima rassegna con leggi_rassegna e cita le notizie rilevanti; se è più vecchia di 7 giorni o manca, proponi di aggiornarla.
- Le operazioni che costano (rassegna, sceneggiatura, immagini, video, voci) e l'export NON le esegui: usa proponi_azione, così l'utente vede un pulsante con il costo e decide lui. Usa proponi_azione anche per portare l'utente in una pagina (vai_a).
- Le chiavi API non le vedi e non le chiedi mai in chat: l'utente le incolla in Impostazioni.
- All'inizio di ogni messaggio dell'utente trovi il contesto della pagina in cui si trova: usalo.
- Scrivi TUTTA la risposta per l'utente nel messaggio finale, dopo aver finito di usare gli strumenti: il testo scritto tra una chiamata e l'altra non viene mostrato. Se hai letto dei dati che l'utente ha chiesto (voci, scene, stato…), riportali lì.
- I pulsanti creati con proponi_azione compaiono sotto la tua risposta finale.`;

const str = (description: string) => ({ type: "string", description });
const nullable = (type: string, description: string) => ({ type: [type, "null"], description });

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "stato_studio",
    description:
      "Stato generale: servizi collegati, voce del narratore, personaggi (con numero di riferimenti e voce) ed episodi con il loro avanzamento.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "leggi_episodio",
    description: "Dettaglio di un episodio: scene, prompt, battute, immagini, voci, quiz e testi social.",
    input_schema: {
      type: "object",
      properties: { episodeId: str("ID dell'episodio") },
      required: ["episodeId"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "crea_personaggio",
    description: "Crea un nuovo personaggio (senza immagini: i riferimenti si caricano o si generano dalla pagina Personaggi).",
    input_schema: {
      type: "object",
      properties: {
        name: str("Nome del personaggio"),
        role: str("Ruolo, es. 'mascotte e narratore', 'protagonista'"),
        description: str("Aspetto e carattere, in inglese, molto preciso"),
        voiceId: nullable("string", "ID voce ElevenLabs, se già scelto"),
      },
      required: ["name", "role", "description", "voiceId"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "modifica_personaggio",
    description: "Modifica descrizione, ruolo o voce di un personaggio esistente. I campi null restano invariati.",
    input_schema: {
      type: "object",
      properties: {
        characterId: str("ID del personaggio"),
        role: nullable("string", "Nuovo ruolo"),
        description: nullable("string", "Nuova descrizione"),
        voiceId: nullable("string", "Nuovo ID voce ElevenLabs"),
      },
      required: ["characterId", "role", "description", "voiceId"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "crea_episodio",
    description: "Crea un nuovo episodio vuoto (la sceneggiatura si genera dopo, con proponi_azione).",
    input_schema: {
      type: "object",
      properties: {
        grade: { type: "string", enum: ["1ª", "2ª", "3ª", "4ª", "5ª"], description: "Classe" },
        subject: str("Materia, es. Storia, Scienze, Matematica"),
        topic: str("Argomento"),
        objectives: str("Obiettivi di apprendimento (anche vuoto)"),
        durationMin: { type: "integer", description: "Durata in minuti (1-12)" },
        aspect: { type: "string", enum: ["16:9", "9:16"], description: "16:9 YouTube, 9:16 Shorts/Reels/TikTok" },
        characterNames: { type: "array", items: { type: "string" }, description: "Nomi dei personaggi presenti" },
        notes: str("Note per l'autore (anche vuoto)"),
      },
      required: ["grade", "subject", "topic", "objectives", "durationMin", "aspect", "characterNames", "notes"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "modifica_scena",
    description:
      "Modifica una scena di un episodio. I campi null restano invariati. Se passi 'lines' sostituisci tutte le battute della scena (le voci già generate di quella scena andranno rifatte).",
    input_schema: {
      type: "object",
      properties: {
        episodeId: str("ID dell'episodio"),
        scene: { type: "integer", description: "Numero della scena" },
        title: nullable("string", "Titolo"),
        visual: nullable("string", "Descrizione per lo storyboard (italiano)"),
        imagePrompt: nullable("string", "Prompt dell'immagine (inglese, senza stile grafico e senza testo nell'immagine)"),
        motion: nullable("string", "Movimento / animazione"),
        useAiVideo: nullable("boolean", "Se la scena va animata con il video AI"),
        lines: {
          type: ["array", "null"],
          description: "Nuove battute della scena",
          items: {
            type: "object",
            properties: { speaker: str("NARRATORE o nome del personaggio"), text: str("Testo") },
            required: ["speaker", "text"],
            additionalProperties: false,
          },
        },
      },
      required: ["episodeId", "scene", "title", "visual", "imagePrompt", "motion", "useAiVideo", "lines"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "imposta_studio",
    description: "Cambia impostazioni non segrete: voce del narratore e/o stile visivo. I campi null restano invariati.",
    input_schema: {
      type: "object",
      properties: {
        narratorVoiceId: nullable("string", "ID voce ElevenLabs del narratore"),
        stylePrompt: nullable("string", "Stile visivo comune (inglese)"),
      },
      required: ["narratorVoiceId", "stylePrompt"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "leggi_rassegna",
    description:
      "Legge l'ultima rassegna stampa salvata: data, sintesi, azioni della settimana e notizie con consiglio. Restituisce null se non ce n'è nessuna.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "cerca_voci",
    description: "Elenca le voci disponibili nell'account ElevenLabs con lingua, genere, età e uso consigliato.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "proponi_azione",
    description:
      "Mostra all'utente un pulsante per un'operazione a pagamento (rassegna stampa, sceneggiatura, immagini, video, voci), per l'export, o per andare in una pagina (vai_a). Non esegue nulla: decide l'utente. Per 'rassegna' episodeId, scene, count e path sono null.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["rassegna", "sceneggiatura", "immagini", "video", "voci", "esporta", "vai_a"] },
        label: str("Testo breve del pulsante, es. 'Genera 2 immagini per la scena 3'"),
        reason: str("Perché lo consigli, in una frase"),
        episodeId: nullable("string", "ID episodio (null solo per vai_a)"),
        scene: nullable("integer", "Numero scena per immagini/video/voci di una scena; null = tutto l'episodio (voci)"),
        count: nullable("integer", "Numero di varianti per 'immagini' (1, 2 o 4)"),
        path: nullable("string", "Percorso per vai_a, es. /personaggi, /episodi/<id>, /impostazioni"),
      },
      required: ["kind", "label", "reason", "episodeId", "scene", "count", "path"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function episodeSummary(e: Episode) {
  const lines = e.scenes.flatMap((s) => s.lines);
  return {
    id: e.id,
    code: e.code,
    title: e.title ?? e.topic,
    grade: e.grade,
    subject: e.subject,
    status: e.status,
    scenes: e.scenes.length,
    sceneWithImage: e.scenes.filter((s) => s.selectedImage).length,
    linesWithVoice: `${lines.filter((l) => l.audio).length}/${lines.length}`,
    aiVideoScenes: e.scenes.filter((s) => s.useAiVideo).map((s) => ({ scene: s.number, done: Boolean(s.video) })),
  };
}

function findCharacters(names: string[], all: Character[]) {
  return names
    .map((n) => all.find((c) => c.name.toLowerCase() === n.toLowerCase()))
    .filter((c): c is Character => Boolean(c));
}

async function estimate(p: Omit<Proposal, "cost">): Promise<number | null> {
  if (p.kind === "rassegna") return COST.press;
  if (p.kind === "sceneggiatura") return COST.script;
  if (!p.episodeId) return null;
  const ep = await getEpisode(p.episodeId);
  if (!ep) return null;
  const scene = ep.scenes.find((s) => s.number === p.scene);
  if (p.kind === "immagini") return (p.count ?? 2) * COST.image;
  if (p.kind === "video") return Math.min(10, Math.max(5, scene?.durationSec ?? 5)) * COST.videoPerSec;
  if (p.kind === "voci") {
    const text = (scene ? scene.lines : ep.scenes.flatMap((s) => s.lines)).map((l) => l.text).join(" ");
    return voiceCost(text);
  }
  return null;
}

async function runTool(name: string, input: Record<string, unknown>, proposals: Record<string, Proposal>, toolId: string) {
  switch (name) {
    case "stato_studio": {
      const [s, chars, eps] = await Promise.all([getSettings(), listCharacters(), listEpisodes()]);
      return {
        servizi: { claude: !!s.anthropicApiKey, falAi: !!s.falKey, elevenLabs: !!s.elevenLabsApiKey, n8n: !!s.n8nWebhookUrl },
        voceNarratore: s.narratorVoiceId || null,
        stileVisivo: s.stylePrompt,
        personaggi: chars.map((c) => ({ id: c.id, name: c.name, role: c.role, riferimenti: c.references.length, voce: c.voiceId || null })),
        episodi: eps.map(episodeSummary),
      };
    }

    case "leggi_episodio": {
      const ep = await getEpisode(String(input.episodeId));
      if (!ep) return { errore: "Episodio non trovato" };
      return {
        ...episodeSummary(ep),
        topic: ep.topic,
        objectives: ep.objectives,
        durationMin: ep.durationMin,
        aspect: ep.aspect,
        learningObjectives: ep.learningObjectives,
        scenes: ep.scenes.map((s) => ({
          number: s.number,
          title: s.title,
          durationSec: s.durationSec,
          visual: s.visual,
          imagePrompt: s.imagePrompt,
          characters: s.characters,
          motion: s.motion,
          useAiVideo: s.useAiVideo,
          images: s.images.length,
          imageChosen: Boolean(s.selectedImage),
          video: Boolean(s.video),
          lines: s.lines.map((l) => ({ speaker: l.speaker, text: l.text, voice: Boolean(l.audio) })),
        })),
        quiz: ep.quiz,
        social: ep.social,
      };
    }

    case "crea_personaggio": {
      const c: Character = {
        id: newId(),
        name: String(input.name).trim(),
        role: String(input.role ?? "").trim(),
        description: String(input.description ?? "").trim(),
        voiceId: input.voiceId ? String(input.voiceId) : "",
        references: [],
        createdAt: new Date().toISOString(),
      };
      await saveCharacter(c);
      return { creato: { id: c.id, name: c.name }, prossimoPasso: "Aggiungere immagini di riferimento dalla pagina Personaggi" };
    }

    case "modifica_personaggio": {
      const c = await getCharacter(String(input.characterId));
      if (!c) return { errore: "Personaggio non trovato" };
      if (input.role !== null) c.role = String(input.role);
      if (input.description !== null) c.description = String(input.description);
      if (input.voiceId !== null) c.voiceId = String(input.voiceId);
      await saveCharacter(c);
      return { aggiornato: c.name };
    }

    case "crea_episodio": {
      const all = await listCharacters();
      const chars = findCharacters(input.characterNames as string[], all);
      const id = newId();
      const now = new Date().toISOString();
      const ep: Episode = {
        id,
        code: `S${String(input.grade).replace(/\D/g, "")}-${String(input.subject).slice(0, 3).toUpperCase()}-${id.slice(0, 3).toUpperCase()}`,
        grade: String(input.grade),
        subject: String(input.subject),
        topic: String(input.topic),
        objectives: String(input.objectives ?? ""),
        durationMin: Math.min(12, Math.max(1, Number(input.durationMin) || 5)),
        aspect: input.aspect as Aspect,
        characterIds: chars.map((c) => c.id),
        notes: String(input.notes ?? ""),
        status: "bozza",
        scenes: [],
        createdAt: now,
        updatedAt: now,
      };
      await saveEpisode(ep);
      return { creato: { id, code: ep.code, path: `/episodi/${id}` }, personaggiCollegati: chars.map((c) => c.name) };
    }

    case "modifica_scena": {
      const ep = await getEpisode(String(input.episodeId));
      const s = ep?.scenes.find((x) => x.number === Number(input.scene));
      if (!ep || !s) return { errore: "Episodio o scena non trovati" };
      for (const k of ["title", "visual", "imagePrompt", "motion"] as const) {
        if (input[k] !== null) s[k] = String(input[k]);
      }
      if (input.useAiVideo !== null) s.useAiVideo = Boolean(input.useAiVideo);
      if (Array.isArray(input.lines)) s.lines = (input.lines as { speaker: string; text: string }[]).map((l) => ({ ...l }));
      await saveEpisode(ep);
      return { aggiornata: `Scena ${s.number} di ${ep.code}` };
    }

    case "imposta_studio": {
      const patch: Record<string, string> = {};
      if (input.narratorVoiceId !== null) patch.narratorVoiceId = String(input.narratorVoiceId);
      if (input.stylePrompt !== null) patch.stylePrompt = String(input.stylePrompt);
      await saveSettings(patch);
      return { aggiornato: Object.keys(patch) };
    }

    case "leggi_rassegna": {
      const d = await getDigest();
      if (!d) return null;
      const days = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86400000);
      return { creataGiorniFa: days, tema: d.focus || null, sintesi: d.headline, azioniSettimana: d.actionsThisWeek, notizie: d.items };
    }

    case "cerca_voci": {
      const s = await getSettings();
      if (!s.elevenLabsApiKey) return { errore: "ElevenLabs non collegato" };
      const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
        headers: { "xi-api-key": s.elevenLabsApiKey },
      });
      if (!res.ok) return { errore: `ElevenLabs ${res.status}` };
      const data = (await res.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] };
      return data.voices.map((v) => ({ id: v.voice_id, name: v.name, ...v.labels }));
    }

    case "proponi_azione": {
      const p = input as unknown as Omit<Proposal, "cost">;
      proposals[toolId] = { ...p, cost: await estimate(p) };
      return { mostrato: true, nota: "Il pulsante è visibile all'utente sotto la tua risposta." };
    }
  }
  return { errore: `Strumento sconosciuto: ${name}` };
}

const MUTATING = new Set(["crea_personaggio", "modifica_personaggio", "crea_episodio", "modifica_scena", "imposta_studio"]);

/**
 * Un turno di conversazione: aggiunge il messaggio dell'utente alla storia,
 * esegue gli strumenti richiesti da Claude e restituisce la storia aggiornata.
 * La storia si estende sempre in coda (mai modificata), come richiede l'API.
 */
export async function chat(history: Msg[], userText: string, pageContext: string) {
  const s = await getSettings();
  const client = new Anthropic({ apiKey: requireKey(s.anthropicApiKey, "Anthropic (Claude)") });

  const messages: Msg[] = [
    ...history,
    {
      role: "user",
      content: [
        { type: "text", text: `[Contesto: ${pageContext}]` },
        { type: "text", text: userText },
      ],
    },
  ];
  const proposals: Record<string, Proposal> = {};
  let changed = false;

  for (let i = 0; i < 10; i++) {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      throw new Error("L'assistente non può rispondere a questa richiesta. Prova a riformularla.");
    }
    if (response.stop_reason !== "tool_use") break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const out = await runTool(block.name, block.input as Record<string, unknown>, proposals, block.id);
        if (MUTATING.has(block.name)) changed = true;
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: String((e as Error).message), is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { messages, proposals, changed };
}
