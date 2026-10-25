import { readJson, writeJson } from "./storage";
import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  anthropicApiKey: "",
  falKey: "",
  elevenLabsApiKey: "",
  falImageModel: "fal-ai/nano-banana-pro",
  falEditModel: "fal-ai/nano-banana-pro/edit",
  falVideoModel: "fal-ai/kling-video/v3/standard/image-to-video",
  elevenLabsModel: "eleven_multilingual_v2",
  narratorVoiceId: "",
  stylePrompt:
    "Children's book 2D illustration, warm soft colors, clean shapes, gentle lighting, friendly expressions, " +
    "consistent character design, no text, no letters, no watermark, safe for young children",
  n8nWebhookUrl: "",
};

const SECRET_KEYS = ["anthropicApiKey", "falKey", "elevenLabsApiKey"] as const;

// Le chiavi salvate nell'app hanno la precedenza; altrimenti si usano le variabili d'ambiente
export async function getSettings(): Promise<Settings> {
  const saved = await readJson<Partial<Settings>>("settings.json", {});
  const s = { ...DEFAULT_SETTINGS, ...saved };
  s.anthropicApiKey ||= process.env.ANTHROPIC_API_KEY ?? "";
  s.falKey ||= process.env.FAL_KEY ?? "";
  s.elevenLabsApiKey ||= process.env.ELEVENLABS_API_KEY ?? "";
  return s;
}

// Versione da mandare al browser: le chiavi non escono mai, solo se sono impostate
export async function getPublicSettings() {
  const s = await getSettings();
  const masked: Record<string, string | boolean> = { ...s };
  for (const k of SECRET_KEYS) {
    masked[k] = "";
    masked[`${k}Set`] = Boolean(s[k]);
  }
  return masked;
}

export async function saveSettings(patch: Partial<Settings>) {
  const saved = await readJson<Partial<Settings>>("settings.json", {});
  for (const k of SECRET_KEYS) {
    // campo vuoto = mantieni la chiave già salvata
    if (!patch[k]) delete patch[k];
  }
  await writeJson("settings.json", { ...saved, ...patch });
}

export function requireKey(value: string, name: string) {
  if (!value) throw new Error(`Manca la chiave ${name}: aggiungila in Impostazioni.`);
  return value;
}
