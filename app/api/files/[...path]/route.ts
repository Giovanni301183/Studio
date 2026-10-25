import { NextResponse } from "next/server";
import { mimeOf, readFile, signedUrl, usingSupabase } from "@/lib/storage";

// Serve i file salvati (immagini, audio, video) all'interfaccia.
// Su Supabase rimanda a un link temporaneo, così anche i video grandi non passano dal server.
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const { path: parts } = await ctx.params;
  const rel = parts.map(decodeURIComponent).join("/");
  try {
    if (usingSupabase()) {
      const url = await signedUrl(rel, 3600);
      return NextResponse.redirect(url!, { headers: { "Cache-Control": "private, max-age=3000" } });
    }
    const data = await readFile(rel);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": mimeOf(rel) } });
  } catch {
    return new Response("Non trovato", { status: 404 });
  }
}
