export type Aspect = "16:9" | "9:16";

export interface Settings {
  anthropicApiKey: string;
  falKey: string;
  elevenLabsApiKey: string;
  // ID dei modelli fal.ai: cambiano spesso, per questo sono modificabili
  falImageModel: string;
  falEditModel: string;
  falVideoModel: string;
  elevenLabsModel: string;
  narratorVoiceId: string;
  // Stile visivo comune a tutte le immagini
  stylePrompt: string;
  n8nWebhookUrl: string;
}

export interface Character {
  id: string;
  name: string;
  role: string; // es. "protagonista", "mascotte/narratore"
  description: string; // aspetto fisico e carattere
  voiceId: string; // ID voce ElevenLabs
  references: string[]; // percorsi relativi in data/ delle immagini di riferimento
  createdAt: string;
}

export interface Line {
  speaker: string; // "NARRATORE" o nome del personaggio
  text: string;
  audio?: string; // percorso relativo del file mp3
}

export interface Scene {
  number: number;
  title: string;
  durationSec: number;
  visual: string; // descrizione per lo storyboard (italiano)
  imagePrompt: string; // prompt per il generatore di immagini (inglese)
  characters: string[]; // nomi dei personaggi presenti
  motion: string; // suggerimento di animazione / movimento di camera
  useAiVideo: boolean; // scena "wow" da animare con l'AI
  lines: Line[];
  images: string[]; // varianti generate
  selectedImage?: string;
  video?: string;
}

export interface SocialTexts {
  youtubeTitle: string;
  youtubeDescription: string;
  tiktok: string;
  instagram: string;
  facebook: string;
  hashtags: string[];
}

export interface Episode {
  id: string;
  code: string; // es. S3-STO-004
  grade: string; // classe
  subject: string; // materia
  topic: string; // argomento
  objectives: string;
  durationMin: number;
  aspect: Aspect;
  characterIds: string[];
  sourceFile?: string; // materiale caricato (PDF, immagine, testo)
  notes: string;
  status: "bozza" | "sceneggiatura" | "asset" | "esportato";
  title?: string;
  learningObjectives?: string[];
  scenes: Scene[];
  quiz?: { question: string; answer: string }[];
  social?: SocialTexts;
  createdAt: string;
  updatedAt: string;
}
