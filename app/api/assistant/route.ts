import type Anthropic from "@anthropic-ai/sdk";
import { chat } from "@/lib/agent";
import { handle } from "@/lib/api";

export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json()) as {
      history: Anthropic.Beta.BetaMessageParam[];
      text: string;
      context: string;
    };
    if (!body.text?.trim()) throw new Error("Scrivi una domanda");
    return chat(body.history ?? [], body.text.trim(), body.context ?? "sconosciuto");
  });
