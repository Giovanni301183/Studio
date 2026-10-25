// Stime indicative in dollari (listini di fal.ai, ElevenLabs e Anthropic da verificare: cambiano spesso)
export const COST = {
  script: 0.15, // una sceneggiatura con Claude
  image: 0.15, // un'immagine Nano Banana Pro
  videoPerSec: 0.08, // Kling v3 standard
  voicePer1000Chars: 0.2, // ElevenLabs, dipende dal piano
  press: 1.2, // una rassegna stampa: 3 ricerche web parallele + lettura dei risultati
};

export const usd = (n: number) => `~${n < 1 ? n.toFixed(2) : n.toFixed(1)} $`;

export const voiceCost = (text: string) => (text.length / 1000) * COST.voicePer1000Chars;
