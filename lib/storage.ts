import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Character, Episode } from "./types";

// Due modi di salvare, stessi percorsi ("characters/<id>/meta.json", "episodes/<id>/scene1/…"):
// - in locale nella cartella data/ (quando Supabase non è configurato)
// - su Supabase: i JSON nella tabella "documents", i file nel bucket "studio"

export const DATA_DIR = path.join(process.cwd(), "data");
const BUCKET = "studio";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

let sb: SupabaseClient | null = null;
export function supabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  sb ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return sb;
}

export const usingSupabase = () => supabase() !== null;

export function abs(rel: string) {
  const full = path.resolve(DATA_DIR, rel);
  if (!full.startsWith(DATA_DIR + path.sep)) throw new Error("Percorso non valido");
  return full;
}

function check(rel: string) {
  if (rel.includes("..") || rel.startsWith("/")) throw new Error("Percorso non valido");
  return rel;
}

const MIME: Record<string, string> = {
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
  ".json": "application/json",
  ".srt": "text/plain; charset=utf-8",
};
export const mimeOf = (rel: string) => MIME[path.extname(rel).toLowerCase()] ?? "application/octet-stream";

// ---------- documenti JSON ----------

export async function readJson<T>(rel: string, fallback: T): Promise<T> {
  const db = supabase();
  if (db) {
    const { data, error } = await db.from("documents").select("data").eq("path", check(rel)).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data?.data as T) ?? fallback;
  }
  try {
    return JSON.parse(await fs.readFile(abs(rel), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(rel: string, data: unknown) {
  const db = supabase();
  if (db) {
    const { error } = await db.from("documents").upsert({ path: check(rel), data, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Supabase: ${error.message}`);
    return;
  }
  const full = abs(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(data, null, 2), "utf8");
}

/** Tutti i documenti il cui percorso inizia con `prefix` e finisce con `suffix`. */
export async function listJson<T>(prefix: string, suffix: string): Promise<T[]> {
  const db = supabase();
  if (db) {
    const { data, error } = await db
      .from("documents")
      .select("path, data")
      .like("path", `${prefix}%${suffix}`)
      .limit(5000);
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).map((r) => r.data as T);
  }
  // in locale: data/<prefix>…<suffix>, cercando fino a due livelli
  const base = path.dirname(abs(`${prefix}x`));
  const found: string[] = [];
  async function walk(dir: string, depth: number) {
    let entries: import("fs").Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 2) await walk(full, depth + 1);
      else if (e.isFile()) {
        const rel = path.relative(DATA_DIR, full).split(path.sep).join("/");
        if (rel.startsWith(prefix) && rel.endsWith(suffix)) found.push(rel);
      }
    }
  }
  await walk(base, 0);
  const items = await Promise.all(found.map((r) => readJson<T | null>(r, null)));
  return items.filter((x): x is Awaited<T> => x !== null) as T[];
}

// ---------- file (immagini, audio, video, PDF) ----------

export async function writeFile(rel: string, data: Buffer | Uint8Array) {
  const db = supabase();
  if (db) {
    const { error } = await db.storage.from(BUCKET).upload(check(rel), data, { contentType: mimeOf(rel), upsert: true });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    return rel;
  }
  const full = abs(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return rel;
}

export async function readFile(rel: string): Promise<Buffer> {
  const db = supabase();
  if (db) {
    const { data, error } = await db.storage.from(BUCKET).download(check(rel));
    if (error || !data) throw new Error(`File non trovato: ${rel}`);
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.readFile(abs(rel));
}

/** URL temporaneo per scaricare un file da Supabase (null in locale). */
export async function signedUrl(rel: string, seconds = 3600) {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(check(rel), seconds);
  if (error) throw new Error(`File non trovato: ${rel}`);
  return data.signedUrl;
}

export async function copyFile(from: string, to: string) {
  const db = supabase();
  if (db) {
    await db.storage.from(BUCKET).remove([check(to)]);
    const { error } = await db.storage.from(BUCKET).copy(check(from), check(to));
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    return to;
  }
  return writeFile(to, await fs.readFile(abs(from)));
}

async function listFilesRecursive(db: SupabaseClient, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data } = await db.storage.from(BUCKET).list(prefix, { limit: 1000 });
  for (const e of data ?? []) {
    const p = `${prefix}/${e.name}`;
    if (e.id === null) out.push(...(await listFilesRecursive(db, p)));
    else out.push(p);
  }
  return out;
}

/** Cancella tutto ciò che sta sotto una cartella (documenti e file). */
export async function removePrefix(prefix: string) {
  const db = supabase();
  if (db) {
    await db.from("documents").delete().like("path", `${check(prefix)}/%`);
    const files = await listFilesRecursive(db, prefix);
    for (let i = 0; i < files.length; i += 100) await db.storage.from(BUCKET).remove(files.slice(i, i + 100));
    return;
  }
  await fs.rm(abs(prefix), { recursive: true, force: true });
}

export async function downloadTo(url: string, rel: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fallito (${res.status}): ${url}`);
  return writeFile(rel, Buffer.from(await res.arrayBuffer()));
}

export function newId() {
  return randomUUID().slice(0, 8);
}

export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
}

// ---------- personaggi ed episodi ----------

export async function listCharacters() {
  const list = await listJson<Character>("characters/", "/meta.json");
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getCharacter = (id: string) => readJson<Character | null>(`characters/${id}/meta.json`, null);

export const saveCharacter = (c: Character) => writeJson(`characters/${c.id}/meta.json`, c);

export const deleteCharacter = (id: string) => removePrefix(`characters/${id}`);

export async function listEpisodes() {
  const list = await listJson<Episode>("episodes/", "/meta.json");
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const getEpisode = (id: string) => readJson<Episode | null>(`episodes/${id}/meta.json`, null);

export async function saveEpisode(e: Episode) {
  e.updatedAt = new Date().toISOString();
  await writeJson(`episodes/${e.id}/meta.json`, e);
  return e;
}

export const deleteEpisode = (id: string) => removePrefix(`episodes/${id}`);
