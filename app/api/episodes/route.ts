import { handle } from "@/lib/api";
import { listEpisodes, newId, safeName, saveEpisode, writeFile } from "@/lib/storage";
import type { Aspect, Episode } from "@/lib/types";

export const GET = () => handle(listEpisodes);

const SUBJECT_CODES: Record<string, string> = {
  Italiano: "ITA",
  Matematica: "MAT",
  Storia: "STO",
  Geografia: "GEO",
  Scienze: "SCI",
  Inglese: "ING",
  Tecnologia: "TEC",
  "Arte e Immagine": "ART",
  Musica: "MUS",
  "Educazione Civica": "CIV",
  "Educazione Motoria": "MOT",
};

// Nuovo episodio: dati + eventuale materiale caricato (PDF, foto del libro, appunti)
export const POST = (req: Request) =>
  handle(async () => {
    const form = await req.formData();
    const id = newId();
    const get = (k: string) => String(form.get(k) ?? "").trim();
    const subject = get("subject");
    const grade = get("grade");

    let sourceFile: string | undefined;
    const f = form.get("source");
    if (f instanceof File && f.size > 0) {
      sourceFile = await writeFile(`episodes/${id}/source-${safeName(f.name)}`, Buffer.from(await f.arrayBuffer()));
    }

    const now = new Date().toISOString();
    const ep: Episode = {
      id,
      code: get("code") || `S${grade.replace(/\D/g, "") || "0"}-${SUBJECT_CODES[subject] ?? "GEN"}-${id.slice(0, 3).toUpperCase()}`,
      grade,
      subject,
      topic: get("topic"),
      objectives: get("objectives"),
      durationMin: Number(get("durationMin")) || 5,
      aspect: (get("aspect") as Aspect) || "16:9",
      characterIds: form.getAll("characterIds").map(String),
      sourceFile,
      notes: get("notes"),
      status: "bozza",
      scenes: [],
      createdAt: now,
      updatedAt: now,
    };
    if (!ep.topic) throw new Error("L'argomento è obbligatorio");
    return saveEpisode(ep);
  });
