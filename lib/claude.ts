import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import path from "path";
import { z } from "zod";
import { getSettings, requireKey } from "./settings";
import { readFile } from "./storage";
import type { Character, Episode } from "./types";

const ScriptSchema = z.object({
  title: z.string(),
  learningObjectives: z.array(z.string()),
  scenes: z.array(
    z.object({
      title: z.string(),
      durationSec: z.number(),
      visual: z.string(),
      imagePrompt: z.string(),
      characters: z.array(z.string()),
      motion: z.string(),
      useAiVideo: z.boolean(),
      lines: z.array(z.object({ speaker: z.string(), text: z.string() })),
    }),
  ),
  quiz: z.array(z.object({ question: z.string(), answer: z.string() })),
  social: z.object({
    youtubeTitle: z.string(),
    youtubeDescription: z.string(),
    tiktok: z.string(),
    instagram: z.string(),
    facebook: z.string(),
    hashtags: z.array(z.string()),
  }),
});

export type GeneratedScript = z.infer<typeof ScriptSchema>;

const SYSTEM = `Sei l'autore di una serie di video educativi in italiano per bambini della scuola primaria (6-11 anni).
Trasformi un argomento del programma scolastico italiano in una storia illustrata con un narratore e brevi dialoghi tra personaggi ricorrenti.

Struttura obbligatoria dell'episodio:
1. Gancio (10-15 secondi): una domanda o un piccolo mistero.
2. Avventura: la storia, in cui il concetto si scopre vivendolo.
3. Spiegazione chiara: la mascotte riassume il concetto con parole semplici.
4. Mini-quiz: 2-3 domande dette a voce, con una pausa per rispondere.
5. Chiusura: ripasso in una frase e anticipazione della prossima puntata.

Regole:
- Contenuti corretti e verificabili. Se un dettaglio è incerto, non inventarlo.
- Frasi brevi, lessico adatto alla classe indicata, tono caldo e mai spaventoso.
- "speaker" è "NARRATORE" oppure il nome esatto di uno dei personaggi forniti.
- "characters" elenca solo nomi dei personaggi forniti che compaiono nella scena.
- "imagePrompt" è in INGLESE: descrivi inquadratura, ambiente, azione e posa dei personaggi (chiamali per nome e ricorda il loro aspetto). Niente scritte o testo nell'immagine. Non descrivere lo stile grafico: viene aggiunto automaticamente.
- "visual" è la descrizione della scena per lo storyboard, in italiano.
- "motion" suggerisce un'animazione semplice (parallasse, zoom lento, gesto del personaggio).
- "useAiVideo" è true solo per 1-2 scene spettacolari in cui un video AI di pochi secondi vale davvero la pena.
- Somma delle durate delle scene ≈ durata richiesta. Calcola circa 2,3 parole al secondo per le battute.
- I testi social (TikTok, Instagram, Facebook) si rivolgono ai GENITORI e agli INSEGNANTI, non ai bambini.`;

function describeCharacters(chars: Character[]) {
  if (chars.length === 0) return "Nessun personaggio fisso: usa solo il NARRATORE.";
  return chars.map((c) => `- ${c.name} (${c.role}): ${c.description}`).join("\n");
}

async function sourceBlock(rel: string): Promise<Anthropic.Beta.BetaContentBlockParam> {
  const data = await readFile(rel);
  const ext = path.extname(rel).toLowerCase();
  if (ext === ".pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") },
    };
  }
  const images: Record<string, "image/png" | "image/jpeg" | "image/webp" | "image/gif"> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  if (images[ext]) {
    return { type: "image", source: { type: "base64", media_type: images[ext], data: data.toString("base64") } };
  }
  return { type: "text", text: `Materiale di riferimento:\n\n${data.toString("utf8")}` };
}

export async function generateScript(ep: Episode, chars: Character[]): Promise<GeneratedScript> {
  const s = await getSettings();
  const client = new Anthropic({ apiKey: requireKey(s.anthropicApiKey, "Anthropic (Claude)") });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (ep.sourceFile) content.push(await sourceBlock(ep.sourceFile));
  content.push({
    type: "text",
    text: `Scrivi la sceneggiatura completa di un episodio.

Classe: ${ep.grade}
Materia: ${ep.subject}
Argomento: ${ep.topic}
Obiettivi indicati dall'insegnante: ${ep.objectives || "(da definire tu, in base al programma)"}
Durata: circa ${ep.durationMin} minuti
Formato video: ${ep.aspect === "9:16" ? "verticale 9:16 (Shorts/Reels/TikTok)" : "orizzontale 16:9 (YouTube)"}
${ep.sourceFile ? "Usa il materiale allegato come base dei contenuti." : ""}
${ep.notes ? `Note aggiuntive: ${ep.notes}` : ""}

Personaggi disponibili:
${describeCharacters(chars)}`,
  });

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(ScriptSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude ha rifiutato la richiesta. Prova a riformulare l'argomento o le note.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Sceneggiatura troppo lunga: riduci la durata dell'episodio e riprova.");
  }
  if (!response.parsed_output) throw new Error("Risposta di Claude non valida, riprova.");
  return response.parsed_output;
}
