import { NextResponse } from "next/server";

/** Esegue l'handler e trasforma qualsiasi errore in una risposta JSON leggibile dall'interfaccia. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function notFound(what: string): never {
  throw new Error(`${what} non trovato`);
}
