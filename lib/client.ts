// Helper usati solo dalle pagine (browser)

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined
      ? { method: rest.method ?? "POST", body: JSON.stringify(json), headers: { "Content-Type": "application/json" } }
      : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
  return data as T;
}

export const fileUrl = (rel: string) => `/api/files/${rel.split("/").map(encodeURIComponent).join("/")}`;

export const SUBJECTS = [
  "Italiano",
  "Matematica",
  "Storia",
  "Geografia",
  "Scienze",
  "Inglese",
  "Tecnologia",
  "Arte e Immagine",
  "Musica",
  "Educazione Civica",
  "Educazione Motoria",
];

export const GRADES = ["1ª", "2ª", "3ª", "4ª", "5ª"];
