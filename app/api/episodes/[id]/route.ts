import { handle, notFound } from "@/lib/api";
import { generateScript } from "@/lib/claude";
import { speak } from "@/lib/elevenlabs";
import { exportEpisode } from "@/lib/export";
import { animateImage, generateImages } from "@/lib/fal";
import { getSettings } from "@/lib/settings";
import { deleteEpisode, getCharacter, getEpisode, saveEpisode } from "@/lib/storage";
import type { Character, Episode, Scene } from "@/lib/types";

type Ctx = RouteContext<"/api/episodes/[id]">;

type Action =
  | { action: "save"; episode: Episode }
  | { action: "script" }
  | { action: "images"; scene: number; count?: number }
  | { action: "select"; scene: number; image: string }
  | { action: "video"; scene: number }
  | { action: "voices"; scene?: number }
  | { action: "export" }
  | { action: "n8n" };

async function load(id: string) {
  const ep = (await getEpisode(id)) ?? notFound("Episodio");
  const chars = (await Promise.all(ep.characterIds.map(getCharacter))).filter((c): c is Character => c !== null);
  return { ep, chars };
}

function scene(ep: Episode, n: number): Scene {
  return ep.scenes.find((s) => s.number === n) ?? notFound("Scena");
}

export const GET = (_req: Request, ctx: Ctx) =>
  handle(async () => {
    const { id } = await ctx.params;
    return load(id);
  });

export const DELETE = (_req: Request, ctx: Ctx) =>
  handle(async () => {
    const { id } = await ctx.params;
    await deleteEpisode(id);
  });

export const POST = (req: Request, ctx: Ctx) =>
  handle(async () => {
    const { id } = await ctx.params;
    const body = (await req.json()) as Action;
    const loaded = await load(id);
    const chars = loaded.chars;
    let ep = loaded.ep;
    const byName = (name: string) => chars.find((c) => c.name.toLowerCase() === name.toLowerCase());

    switch (body.action) {
      case "save": {
        // Modifiche manuali dall'editor: si mantengono id e file già generati
        ep = { ...body.episode, id: ep.id, createdAt: ep.createdAt };
        break;
      }

      case "script": {
        const g = await generateScript(ep, chars);
        ep.title = g.title;
        ep.learningObjectives = g.learningObjectives;
        ep.quiz = g.quiz;
        ep.social = g.social;
        ep.scenes = g.scenes.map((s, i) => ({ ...s, number: i + 1, images: [] }));
        ep.status = "sceneggiatura";
        break;
      }

      case "images": {
        const s = scene(ep, body.scene);
        const references = s.characters.flatMap((n) => byName(n)?.references.slice(0, 3) ?? []);
        const created = await generateImages({
          prompt: s.imagePrompt,
          references,
          aspect: ep.aspect,
          count: body.count ?? 2,
          outDir: `episodes/${ep.id}/scene${s.number}`,
        });
        s.images.push(...created);
        s.selectedImage ??= created[0];
        ep.status = "asset";
        break;
      }

      case "select": {
        scene(ep, body.scene).selectedImage = body.image;
        break;
      }

      case "video": {
        const s = scene(ep, body.scene);
        if (!s.selectedImage) throw new Error("Prima genera e scegli un'immagine per questa scena");
        s.video = await animateImage({
          image: s.selectedImage,
          prompt: `${s.motion}. ${s.imagePrompt}`,
          durationSec: Math.min(s.durationSec, 10),
          outFile: `episodes/${ep.id}/scene${s.number}/video-${Date.now()}.mp4`,
        });
        break;
      }

      case "voices": {
        const settings = await getSettings();
        const targets = body.scene ? [scene(ep, body.scene)] : ep.scenes;
        for (const s of targets) {
          for (const [i, line] of s.lines.entries()) {
            const voice = line.speaker.toUpperCase() === "NARRATORE" ? settings.narratorVoiceId : byName(line.speaker)?.voiceId;
            line.audio = await speak(
              line.text,
              voice || settings.narratorVoiceId,
              `episodes/${ep.id}/scene${s.number}/voce-${i + 1}-${Date.now()}.mp3`,
            );
          }
          await saveEpisode(ep); // salva dopo ogni scena: se una voce fallisce non si perde il resto
        }
        break;
      }

      case "export": {
        const result = await exportEpisode(ep);
        ep.status = "esportato";
        await saveEpisode(ep);
        return { episode: ep, export: result };
      }

      case "n8n": {
        const { n8nWebhookUrl } = await getSettings();
        if (!n8nWebhookUrl) throw new Error("Imposta l'URL del webhook n8n in Impostazioni");
        const result = await exportEpisode(ep);
        const res = await fetch(n8nWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "episodio_pronto", episode: ep, exportDir: result.dir, manifest: result.manifest }),
        });
        if (!res.ok) throw new Error(`n8n ha risposto ${res.status}: ${await res.text()}`);
        return { episode: ep, sent: true };
      }
    }

    return { episode: await saveEpisode(ep) };
  });
