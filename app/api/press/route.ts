import { handle } from "@/lib/api";
import { createDigest, getDigest, listDigests } from "@/lib/press";

// GET: elenco delle rassegne + quella richiesta (?id=) o l'ultima
export const GET = (req: Request) =>
  handle(async () => {
    const id = new URL(req.url).searchParams.get("id") ?? undefined;
    const [list, digest] = await Promise.all([listDigests(), getDigest(id)]);
    return { list, digest };
  });

// POST: nuova rassegna con ricerca sul web (1-3 minuti)
export const POST = (req: Request) =>
  handle(async () => {
    const { focus } = (await req.json().catch(() => ({}))) as { focus?: string };
    return { digest: await createDigest(focus ?? "") };
  });
