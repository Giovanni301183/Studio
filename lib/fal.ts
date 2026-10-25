import { createFalClient } from "@fal-ai/client";
import path from "path";
import { getSettings, requireKey } from "./settings";
import { downloadTo, readFile } from "./storage";
import type { Aspect } from "./types";

async function client() {
  const s = await getSettings();
  return { fal: createFalClient({ credentials: requireKey(s.falKey, "fal.ai") }), s };
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

// fal.ai lavora con URL: carichiamo i file locali nel suo storage temporaneo
async function uploadLocal(fal: ReturnType<typeof createFalClient>, rel: string) {
  const type = MIME[path.extname(rel).toLowerCase()] ?? "application/octet-stream";
  return fal.storage.upload(new Blob([new Uint8Array(await readFile(rel))], { type }));
}

/**
 * Genera immagini. Con immagini di riferimento usa il modello "edit",
 * che mantiene l'aspetto dei personaggi; senza, il modello testo→immagine.
 * Restituisce i percorsi locali dei file salvati in `outDir`.
 */
export async function generateImages(opts: {
  prompt: string;
  references: string[];
  aspect: Aspect | "1:1";
  count: number;
  outDir: string;
}) {
  const { fal, s } = await client();
  const prompt = `${opts.prompt}\n\nStyle: ${s.stylePrompt}`;
  let images: { url: string }[];

  if (opts.references.length > 0) {
    const image_urls = await Promise.all(opts.references.slice(0, 6).map((r) => uploadLocal(fal, r)));
    const result = await fal.subscribe(s.falEditModel, {
      input: {
        prompt:
          "Keep the characters from the reference images exactly identical (face, colors, clothes, proportions). " +
          prompt,
        image_urls,
        aspect_ratio: opts.aspect,
        num_images: opts.count,
      },
    });
    images = (result.data as { images: { url: string }[] }).images;
  } else {
    const result = await fal.subscribe(s.falImageModel, {
      input: { prompt, aspect_ratio: opts.aspect, num_images: opts.count },
    });
    images = (result.data as { images: { url: string }[] }).images;
  }

  const stamp = Date.now();
  return Promise.all(
    images.map((img, i) => {
      const ext = path.extname(new URL(img.url).pathname) || ".png";
      return downloadTo(img.url, `${opts.outDir}/${stamp}-${i}${ext}`);
    }),
  );
}

/** Anima un'immagine (clip breve per le scene "wow"). */
export async function animateImage(opts: {
  image: string;
  prompt: string;
  durationSec: number;
  outFile: string;
}) {
  const { fal, s } = await client();
  const imageUrl = await uploadLocal(fal, opts.image);
  const duration = String(Math.min(10, Math.max(5, Math.round(opts.durationSec))));
  // Kling v3 usa start_image_url, le versioni precedenti image_url
  const imageField = s.falVideoModel.includes("/v3/") ? "start_image_url" : "image_url";
  const result = await fal.subscribe(s.falVideoModel, {
    input: {
      [imageField]: imageUrl,
      prompt: `${opts.prompt}. Gentle, smooth animation for a children's educational video.`,
      duration,
      negative_prompt: "blur, distortion, extra limbs, scary, text",
    },
  });
  const video = (result.data as { video: { url: string } }).video;
  return downloadTo(video.url, opts.outFile);
}
