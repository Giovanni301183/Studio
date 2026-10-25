# Studio — backstage di produzione

App locale per creare tutto il materiale di un episodio: personaggi coerenti, sceneggiatura, immagini delle scene, voci e clip animate, fino al pacchetto pronto per il montaggio e per n8n.

## Avvio

Doppio clic su **`Avvia Studio.bat`** (la prima volta installa le dipendenze). Si apre il browser su http://localhost:3000.

In alternativa, da terminale nella cartella `studio`:

```bash
npm install
npm run dev
```

Serve Node.js 20 o superiore.

## Servizi collegati

| Servizio | A cosa serve | Dove prendere la chiave |
|---|---|---|
| Anthropic (Claude) | Sceneggiature, quiz, testi social | console.anthropic.com → API Keys |
| fal.ai | Immagini (Nano Banana Pro) e video (Kling) | fal.ai → Dashboard → Keys |
| ElevenLabs | Voci in italiano | elevenlabs.io → Profilo → API Keys |
| n8n (facoltativo) | Riceve l'episodio pronto per la pubblicazione | URL del nodo Webhook |

Le chiavi si inseriscono nella pagina **Impostazioni** e restano in `data/settings.json` sul tuo computer. In alternativa: variabili d'ambiente `ANTHROPIC_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`.

I modelli fal.ai cambiano spesso: se esce un modello migliore, basta cambiare il suo ID in Impostazioni.

## Flusso

1. **Personaggi**: descrizione precisa + immagini di riferimento (caricate o generate: proposte, scheda di rotazione, scheda espressioni).
2. **Episodio**: classe, materia, argomento, personaggi e materiale facoltativo (PDF, foto del libro, .txt).
3. **Genera sceneggiatura** → revisione didattica → correzioni nell'editor.
4. Per ogni scena: **Genera immagini** (usa i riferimenti dei personaggi in scena) → scegli la variante → **Anima scena** solo per i momenti "wow".
5. **Genera tutte le voci** (narratore + una voce per personaggio).
6. **Esporta pacchetto** → cartella `data/episodes/<id>/export` con immagini, clip, audio numerati, `sceneggiatura.md`, `sottotitoli.srt` (tempi stimati) ed `episodio.json`.
7. **Invia a n8n** → POST al webhook con `{ event: "episodio_pronto", episode, exportDir, manifest }`.

## Dove sono i file

Tutto in `studio/data/` (esclusa da git): `characters/<id>/` ed `episodes/<id>/`. Fai un backup regolare di questa cartella.
