// Copia su Supabase tutto quello che lo Studio ha salvato sul PC (cartella data/).
// Uso: npm run migrate-supabase   (legge SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da .env.local)
// Si può rilanciare: sovrascrive senza duplicare.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".srt": "text/plain" };

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const root = path.resolve("data");
if (!existsSync(root)) {
  console.log("Nessuna cartella data/: niente da copiare.");
  process.exit(0);
}

let docs = 0, files = 0;
for (const full of walk(root)) {
  const rel = path.relative(root, full).split(path.sep).join("/");
  if (rel.includes("/export/")) continue; // gli export si rigenerano
  const ext = path.extname(rel).toLowerCase();
  if (ext === ".json") {
    const data = JSON.parse(readFileSync(full, "utf8"));
    if (rel === "settings.json") for (const k of ["anthropicApiKey", "falKey", "elevenLabsApiKey"]) delete data[k]; // le chiavi stanno su Vercel
    const { error } = await db.from("documents").upsert({ path: rel, data, updated_at: new Date().toISOString() });
    if (error) throw new Error(`${rel}: ${error.message}`);
    docs++;
  } else {
    const { error } = await db.storage.from("studio").upload(rel, readFileSync(full), { contentType: MIME[ext] ?? "application/octet-stream", upsert: true });
    if (error) throw new Error(`${rel}: ${error.message}`);
    files++;
  }
  process.stdout.write(`\r${docs} documenti, ${files} file…`);
}
console.log(`\nFatto: ${docs} documenti e ${files} file copiati su Supabase.`);
