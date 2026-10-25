"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type S = Record<string, string | boolean>;

const KEYS = [
  { k: "anthropicApiKey", label: "Chiave Anthropic (Claude)", help: "console.anthropic.com → API Keys" },
  { k: "falKey", label: "Chiave fal.ai", help: "fal.ai → Dashboard → Keys" },
  { k: "elevenLabsApiKey", label: "Chiave ElevenLabs", help: "elevenlabs.io → Profilo → API Keys" },
];

const FIELDS = [
  { k: "narratorVoiceId", label: "ID voce del narratore (ElevenLabs)", help: "Voice Library → scegli una voce → copia l'ID" },
  { k: "falImageModel", label: "Modello immagini (testo → immagine)", help: "ID del modello su fal.ai" },
  { k: "falEditModel", label: "Modello immagini con riferimenti", help: "Usato quando nella scena ci sono personaggi" },
  { k: "falVideoModel", label: "Modello video (immagine → video)", help: "Es. Kling: cerca \"image-to-video\" su fal.ai" },
  { k: "elevenLabsModel", label: "Modello voce ElevenLabs", help: "eleven_multilingual_v2 è stabile in italiano" },
  { k: "n8nWebhookUrl", label: "URL webhook n8n", help: "Nodo Webhook (POST) del tuo workflow" },
];

export default function SettingsPage() {
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<S>("/api/settings").then(setS).catch((e) => setMsg(e.message));
  }, []);

  if (!s) return <p className="muted">{msg || "Caricamento…"}</p>;

  const set = (k: string, v: string) => setS({ ...s, [k]: v });

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      setS(await api<S>("/api/settings", { json: s }));
      setMsg("Salvato ✓");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Impostazioni</h1>
        <p className="muted mt-1">
          Le chiavi restano sul tuo computer (cartella <code>studio/data/settings.json</code>) e non vengono mai mostrate di
          nuovo.
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Servizi collegati</h2>
        {KEYS.map(({ k, label, help }) => (
          <div key={k}>
            <label className="label">
              {label} {s[`${k}Set`] ? <span className="text-green-700">· collegata ✓</span> : null}
            </label>
            <input
              type="password"
              className="input"
              placeholder={s[`${k}Set`] ? "•••••••• (lascia vuoto per non cambiarla)" : "Incolla la chiave"}
              value={String(s[k] ?? "")}
              onChange={(e) => set(k, e.target.value)}
            />
            <p className="muted mt-1 text-xs">{help}</p>
          </div>
        ))}
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Stile visivo del canale</h2>
        <textarea
          className="input min-h-28"
          value={String(s.stylePrompt ?? "")}
          onChange={(e) => set("stylePrompt", e.target.value)}
        />
        <p className="muted text-xs">
          In inglese: viene aggiunto a ogni immagine generata. Tienilo uguale per tutto il canale.
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Modelli e collegamenti</h2>
        {FIELDS.map(({ k, label, help }) => (
          <div key={k}>
            <label className="label">{label}</label>
            <input className="input" value={String(s[k] ?? "")} onChange={(e) => set(k, e.target.value)} />
            <p className="muted mt-1 text-xs">{help}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Salvataggio…" : "Salva impostazioni"}
        </button>
        <span className="text-sm">{msg}</span>
      </div>
    </div>
  );
}
