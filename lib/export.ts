import { promises as fs } from "fs";
import path from "path";
import { abs, writeFile } from "./storage";
import type { Episode } from "./types";

const WORDS_PER_SEC = 2.3;

function srtTime(sec: number) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** Sottotitoli con tempi stimati: il montatore li riallinea sull'audio definitivo. */
export function buildSrt(ep: Episode) {
  const out: string[] = [];
  let t = 0;
  let n = 1;
  for (const scene of ep.scenes) {
    const sceneStart = t;
    for (const line of scene.lines) {
      const dur = Math.max(1.5, line.text.split(/\s+/).length / WORDS_PER_SEC);
      out.push(`${n++}\n${srtTime(t)} --> ${srtTime(t + dur)}\n${line.text}\n`);
      t += dur + 0.3;
    }
    t = Math.max(t, sceneStart + scene.durationSec);
  }
  return out.join("\n");
}

export function buildScriptMd(ep: Episode) {
  const md: string[] = [
    `# ${ep.code} — ${ep.title ?? ep.topic}`,
    "",
    `- Classe: ${ep.grade} · Materia: ${ep.subject} · Argomento: ${ep.topic}`,
    `- Durata prevista: ${ep.durationMin} min · Formato: ${ep.aspect}`,
    "",
    "## Obiettivi di apprendimento",
    ...(ep.learningObjectives ?? []).map((o) => `- ${o}`),
    "",
  ];
  for (const s of ep.scenes) {
    md.push(`## SCENA ${s.number} — ${s.title} (${s.durationSec}s)`);
    md.push(`[VISIVO] ${s.visual}`, `[MOVIMENTO] ${s.motion}`);
    if (s.useAiVideo) md.push("[VIDEO AI] sì");
    md.push("");
    for (const l of s.lines) md.push(`**${l.speaker}:** ${l.text}`);
    md.push("");
  }
  if (ep.quiz?.length) {
    md.push("## Quiz", ...ep.quiz.map((q, i) => `${i + 1}. ${q.question} — _${q.answer}_`), "");
  }
  if (ep.social) {
    const so = ep.social;
    md.push(
      "## Testi per i social",
      `**YouTube — titolo:** ${so.youtubeTitle}`,
      "",
      `**YouTube — descrizione:**\n${so.youtubeDescription}`,
      "",
      `**TikTok:** ${so.tiktok}`,
      "",
      `**Instagram:** ${so.instagram}`,
      "",
      `**Facebook:** ${so.facebook}`,
      "",
      `**Hashtag:** ${so.hashtags.join(" ")}`,
      "",
    );
  }
  md.push("---", "✅ Revisione didattica: ____________________  Data: ________");
  return md.join("\n");
}

/**
 * Crea la cartella "export" pronta per il montatore:
 * immagini e audio numerati per scena, sceneggiatura, sottotitoli e dati in JSON (per n8n).
 */
export async function exportEpisode(ep: Episode) {
  const dir = `episodes/${ep.id}/export`;
  await fs.rm(abs(dir), { recursive: true, force: true });

  const copy = async (rel: string, name: string) => {
    await writeFile(`${dir}/${name}`, await fs.readFile(abs(rel)));
    return `${dir}/${name}`;
  };

  const manifest = [];
  for (const s of ep.scenes) {
    const p = String(s.number).padStart(2, "0");
    const entry: Record<string, unknown> = { scene: s.number, title: s.title, durationSec: s.durationSec };
    if (s.selectedImage) entry.image = await copy(s.selectedImage, `scena${p}${path.extname(s.selectedImage)}`);
    if (s.video) entry.video = await copy(s.video, `scena${p}_video${path.extname(s.video)}`);
    entry.audio = [];
    for (const [i, l] of s.lines.entries()) {
      if (l.audio) {
        (entry.audio as string[]).push(
          await copy(l.audio, `scena${p}_battuta${String(i + 1).padStart(2, "0")}_${l.speaker.replace(/\W+/g, "")}.mp3`),
        );
      }
    }
    manifest.push(entry);
  }

  await writeFile(`${dir}/sceneggiatura.md`, Buffer.from(buildScriptMd(ep), "utf8"));
  await writeFile(`${dir}/sottotitoli.srt`, Buffer.from(buildSrt(ep), "utf8"));
  await writeFile(
    `${dir}/episodio.json`,
    Buffer.from(JSON.stringify({ ...ep, manifest }, null, 2), "utf8"),
  );
  return { dir: abs(dir), manifest };
}
