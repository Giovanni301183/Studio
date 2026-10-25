import { getSettings, requireKey } from "./settings";
import { writeFile } from "./storage";

/** Sintesi vocale di una battuta; salva l'mp3 in `outFile`. */
export async function speak(text: string, voiceId: string, outFile: string) {
  const s = await getSettings();
  const key = requireKey(s.elevenLabsApiKey, "ElevenLabs");
  if (!voiceId) throw new Error("Voce non impostata per questo personaggio (o per il narratore).");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: s.elevenLabsModel,
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return writeFile(outFile, Buffer.from(await res.arrayBuffer()));
}
