import { handle, notFound } from "@/lib/api";
import { generateImages } from "@/lib/fal";
import { deleteCharacter, getCharacter, safeName, saveCharacter, writeFile } from "@/lib/storage";

type Ctx = RouteContext<"/api/characters/[id]">;

// Modifica dati, aggiunge riferimenti, o genera schede (turnaround / espressioni)
export const POST = (req: Request, ctx: Ctx) =>
  handle(async () => {
    const { id } = await ctx.params;
    const c = (await getCharacter(id)) ?? notFound("Personaggio");
    const form = await req.formData();
    const action = String(form.get("action") ?? "update");

    if (action === "update") {
      for (const k of ["name", "role", "description", "voiceId"] as const) {
        const v = form.get(k);
        if (v !== null) c[k] = String(v).trim();
      }
      for (const f of form.getAll("references")) {
        if (f instanceof File && f.size > 0) {
          c.references.push(
            await writeFile(`characters/${id}/ref-${Date.now()}-${safeName(f.name)}`, Buffer.from(await f.arrayBuffer())),
          );
        }
      }
    }

    if (action === "removeRef") {
      const ref = String(form.get("ref"));
      c.references = c.references.filter((r) => r !== ref);
    }

    if (action === "sheet" || action === "expressions" || action === "concept") {
      const prompts = {
        concept: `Character design of ${c.name}, ${c.role}. ${c.description}. Full body, neutral pose, plain white background.`,
        sheet: `Character turnaround sheet of ${c.name}: front view, three-quarter view, side view and back view, full body, same scale, plain white background. ${c.description}`,
        expressions: `Expression sheet of ${c.name}: 8 head portraits in a grid showing happy, surprised, thinking, laughing, sad, curious, proud, explaining. Plain white background. ${c.description}`,
      };
      const created = await generateImages({
        prompt: prompts[action],
        references: c.references,
        aspect: action === "concept" ? "1:1" : "16:9",
        count: action === "concept" ? 4 : 1,
        outDir: `characters/${id}/generated`,
      });
      // Le immagini generate restano "proposte": si promuovono a riferimento con "promote"
      return { character: c, created };
    }

    if (action === "promote") {
      const ref = String(form.get("ref"));
      if (ref.startsWith(`characters/${id}/`) && !c.references.includes(ref)) c.references.push(ref);
    }

    await saveCharacter(c);
    return { character: c };
  });

export const DELETE = (_req: Request, ctx: Ctx) =>
  handle(async () => {
    const { id } = await ctx.params;
    await deleteCharacter(id);
  });
