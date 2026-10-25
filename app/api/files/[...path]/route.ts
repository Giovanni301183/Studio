import path from "path";
import { readFile } from "@/lib/storage";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

// Serve i file salvati in data/ (immagini, audio, video) all'interfaccia
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const { path: parts } = await ctx.params;
  const rel = parts.map(decodeURIComponent).join("/");
  try {
    const data = await readFile(rel);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[path.extname(rel).toLowerCase()] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("Non trovato", { status: 404 });
  }
}
