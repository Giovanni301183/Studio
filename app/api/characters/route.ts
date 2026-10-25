import { handle } from "@/lib/api";
import { listCharacters, newId, safeName, saveCharacter, writeFile } from "@/lib/storage";
import type { Character } from "@/lib/types";

export const GET = () => handle(listCharacters);

// Nuovo personaggio: dati del form + immagini di riferimento caricate
export const POST = (req: Request) =>
  handle(async () => {
    const form = await req.formData();
    const id = newId();
    const references: string[] = [];
    for (const f of form.getAll("references")) {
      if (f instanceof File && f.size > 0) {
        references.push(
          await writeFile(`characters/${id}/ref-${Date.now()}-${safeName(f.name)}`, Buffer.from(await f.arrayBuffer())),
        );
      }
    }
    const c: Character = {
      id,
      name: String(form.get("name") ?? "").trim(),
      role: String(form.get("role") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      voiceId: String(form.get("voiceId") ?? "").trim(),
      references,
      createdAt: new Date().toISOString(),
    };
    if (!c.name) throw new Error("Il nome del personaggio è obbligatorio");
    await saveCharacter(c);
    return c;
  });
