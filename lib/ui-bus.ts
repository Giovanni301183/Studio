"use client";

import { useSyncExternalStore } from "react";

// Piccolo canale condiviso tra le pagine e l'assistente:
// - le pagine dicono dove si trova l'utente (episodio, scena…)
// - l'assistente chiede alle pagine di ricaricare i dati dopo una modifica

export type UiContext = { episodeId?: string; scene?: number; characterId?: string };

let ctx: UiContext = {};
const listeners = new Set<() => void>();

export function setUiContext(next: UiContext) {
  ctx = next;
  listeners.forEach((l) => l());
}

export function useUiContext() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ctx,
    () => ctx,
  );
}

export const REFRESH_EVENT = "studio:refresh";

export function requestRefresh() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

export const OPEN_ASSISTANT_EVENT = "studio:assistant";

/** Apre il pannello dell'assistente, opzionalmente con una domanda già pronta. */
export function askAssistant(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: question }));
}
