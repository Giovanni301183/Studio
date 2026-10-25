import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Character, Episode } from "./types";

// Tutto viene salvato in locale nella cartella data/ (esclusa da git)
export const DATA_DIR = path.join(process.cwd(), "data");

export function abs(rel: string) {
  const full = path.resolve(DATA_DIR, rel);
  if (!full.startsWith(DATA_DIR + path.sep)) throw new Error("Percorso non valido");
  return full;
}

export async function readJson<T>(rel: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(abs(rel), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(rel: string, data: unknown) {
  const full = abs(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(data, null, 2), "utf8");
}

export async function writeFile(rel: string, data: Buffer | Uint8Array) {
  const full = abs(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return rel;
}

export async function readFile(rel: string) {
  return fs.readFile(abs(rel));
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

async function listDir<T>(dir: string): Promise<T[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(abs(dir));
  } catch {
    return [];
  }
  const items = await Promise.all(
    entries.map((e) => readJson<T | null>(`${dir}/${e}/meta.json`, null)),
  );
  return items.filter((x): x is Awaited<T> => x !== null) as T[];
}

export async function listCharacters() {
  const list = await listDir<Character>("characters");
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getCharacter = (id: string) =>
  readJson<Character | null>(`characters/${id}/meta.json`, null);

export const saveCharacter = (c: Character) => writeJson(`characters/${c.id}/meta.json`, c);

export async function deleteCharacter(id: string) {
  await fs.rm(abs(`characters/${id}`), { recursive: true, force: true });
}

export async function listEpisodes() {
  const list = await listDir<Episode>("episodes");
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const getEpisode = (id: string) =>
  readJson<Episode | null>(`episodes/${id}/meta.json`, null);

export async function saveEpisode(e: Episode) {
  e.updatedAt = new Date().toISOString();
  await writeJson(`episodes/${e.id}/meta.json`, e);
  return e;
}

export async function deleteEpisode(id: string) {
  await fs.rm(abs(`episodes/${id}`), { recursive: true, force: true });
}
