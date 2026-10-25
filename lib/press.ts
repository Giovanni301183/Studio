import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getSettings, requireKey } from "./settings";
import { listJson, readJson, writeJson } from "./storage";

export const PRESS_CATEGORIES = [
  "Strumenti AI",
  "Piattaforme e regole",
  "Scuola e didattica",
  "Mercato e concorrenti",
  "Leggi e privacy",
  "Idee e tendenze",
] as const;

const DigestSchema = z.object({
  headline: z.string(),
  actionsThisWeek: z.array(z.string()),
  items: z.array(
    z.object({
      title: z.string(),
      source: z.string(),
      url: z.string(),
      date: z.string(),
      category: z.enum(PRESS_CATEGORIES),
      priority: z.enum(["alta", "media", "bassa"]),
      summary: z.string(),
      whyItMatters: z.string(),
      action: z.string(),
    }),
  ),
});

export type PressDigest = z.infer<typeof DigestSchema> & { id: string; createdAt: string; focus: string };

const PROJECT = `Il progetto: un canale educativo italiano (YouTube, TikTok, Instagram, Facebook) di storie illustrate per bambini della scuola primaria (6-11 anni), che copre tutte le materie del programma ministeriale. I video sono illustrazioni 2D animate con narratore e dialoghi, prodotti con AI (Claude per le sceneggiature, fal.ai con Nano Banana Pro e Kling per immagini e video, ElevenLabs per le voci) e pubblicati con n8n. Più avanti diventerà un'app con quiz e percorsi. Il pubblico sui social sono genitori e insegnanti; su YouTube i video sono "Made for Kids". Il lancio è previsto per gennaio 2027, partendo dalla classe 3ª.`;

// Le aree sono divise in 3 ricerche parallele: ognuna ha il suo budget di ricerche web
const AREA_GROUPS = [
  [
    "Strumenti AI: novità, nuovi modelli, dismissioni, prezzi e funzioni di generatori di immagini, video, voci e animazione (fal.ai, Kling, Google Veo, Runway, Nano Banana, ElevenLabs, Midjourney, Adobe…).",
    "Idee e tendenze: formati e stili di video che funzionano con i bambini e con i genitori, casi di successo di contenuti educativi.",
  ],
  [
    "Piattaforme e regole: YouTube (Made for Kids, YouTube Kids, monetizzazione, policy sui contenuti AI e sui contenuti ripetitivi), TikTok, Instagram, Facebook (algoritmi, minori, etichette AI).",
    "Mercato e concorrenti: canali YouTube e app educative per bambini in Italia e nel mondo, edutainment, editori scolastici, trend di contenuti per famiglie.",
  ],
  [
    "Scuola e didattica in Italia: Ministero dell'Istruzione e del Merito, Indicazioni Nazionali per il curricolo, calendario scolastico, INVALSI, scuola digitale, uso dei video in classe.",
    "Leggi e privacy: AI Act (obblighi di trasparenza), GDPR e minori, Garante Privacy, AGCOM e influencer, legge italiana sull'AI (L. 132/2025), diritto d'autore e AI in Italia e UE.",
  ],
];

const RESEARCH_PROMPT = (today: string, focus: string, areas: string[], tools: string) => `${PROJECT}

Strumenti e modelli configurati oggi nello Studio (usa questi nomi esatti nei consigli, non supporre altro): ${tools}

Oggi è il ${today}. Cerca sul web, in italiano e in inglese, le notizie degli ULTIMI 30 GIORNI utili a questo progetto, SOLO in queste aree:
${areas.map((a, i) => `${i + 1}. ${a}`).join("\n")}
${focus ? `\nL'utente chiede di dare particolare attenzione a: ${focus}\n` : ""}
Per ogni notizia rilevante annota: titolo, fonte, URL esatto, data, cosa dice (2-3 frasi), perché riguarda QUESTO progetto e un consiglio pratico e concreto su cosa fare. Scarta le notizie generiche o non verificabili e non inventare nulla: se un'area non ha novità vere, dillo. Punta a 3-6 notizie per area.`;

const STRUCTURE_PROMPT = `Trasforma la ricerca qui sotto nella rassegna stampa strutturata, in italiano semplice (chi legge non è un tecnico).
- headline: sintesi della situazione in 2-3 frasi.
- actionsThisWeek: le 3-5 azioni più importanti da fare questa settimana, concrete, in ordine di priorità.
- items: una voce per notizia, con l'URL esatto dalla ricerca (non inventarne). priority "alta" = richiede un'azione o cambia i piani; "media" = da tenere d'occhio; "bassa" = curiosità utile.
- date nel formato AAAA-MM-GG quando nota, altrimenti come riportata.

RICERCA:
`;

async function client() {
  const s = await getSettings();
  return new Anthropic({ apiKey: requireKey(s.anthropicApiKey, "Anthropic (Claude)") });
}

/** Ricerca sul web con Claude e restituisce il resoconto testuale (con le fonti). */
async function research(c: Anthropic, focus: string, areas: string[], tools: string) {
  const today = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: RESEARCH_PROMPT(today, focus, areas, tools) }];
  let response: Anthropic.Beta.BetaMessage | undefined;

  // La ricerca può fermarsi a metà (pause_turn): si riprende rimandando il turno dell'assistente
  for (let i = 0; i < 5; i++) {
    response = await c.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10, user_location: { type: "approximate", country: "IT" } }],
      messages,
    });
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response) throw new Error("Nessuna risposta dalla ricerca");
  if (response.stop_reason === "refusal") throw new Error("La ricerca è stata rifiutata: prova a cambiare il tema richiesto.");

  // Testo finale + URL citati (servono alla fase di strutturazione)
  const text = response.content
    .map((b) => {
      if (b.type !== "text") return "";
      const urls = (b.citations ?? []).map((c) => ("url" in c ? ` [fonte: ${c.url}]` : "")).join("");
      return b.text + urls;
    })
    .join("");
  if (!text.trim()) throw new Error("La ricerca non ha prodotto risultati, riprova.");
  return text;
}

export async function createDigest(focus = ""): Promise<PressDigest> {
  const c = await client();
  const s = await getSettings();
  const tools =
    `sceneggiature con Claude; immagini con fal.ai "${s.falImageModel}" e "${s.falEditModel}"; ` +
    `video con fal.ai "${s.falVideoModel}"; voci con ElevenLabs "${s.elevenLabsModel}"; pubblicazione con n8n (ancora da collegare).`;

  // Tre ricerche in parallelo; se una fallisce le altre bastano a fare la rassegna
  const results = await Promise.allSettled(AREA_GROUPS.map((areas) => research(c, focus.trim(), areas, tools)));
  const reports = results.flatMap((r, i) =>
    r.status === "fulfilled" ? [`### Ricerca ${i + 1}\n${r.value}`] : [`### Ricerca ${i + 1}\n(non riuscita: ${(r.reason as Error).message})`],
  );
  if (results.every((r) => r.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
  const report = reports.join("\n\n");

  const response = await c.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(DigestSchema) },
    messages: [{ role: "user", content: STRUCTURE_PROMPT + report }],
  });
  if (!response.parsed_output) throw new Error("Non sono riuscito a ordinare la rassegna, riprova.");

  const now = new Date();
  const digest: PressDigest = {
    ...response.parsed_output,
    id: now.toISOString().replace(/[:.]/g, "-"),
    createdAt: now.toISOString(),
    focus: focus.trim(),
  };
  await writeJson(`press/${digest.id}.json`, digest);
  return digest;
}

export async function listDigests() {
  const all = await listJson<PressDigest>("press/", ".json");
  return all
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((d) => ({ id: d.id, createdAt: d.createdAt, focus: d.focus, items: d.items.length }));
}

export async function getDigest(id?: string) {
  const target = id ?? (await listDigests())[0]?.id;
  if (!target || !/^[\w-]+$/.test(target)) return null;
  return readJson<PressDigest | null>(`press/${target}.json`, null);
}
