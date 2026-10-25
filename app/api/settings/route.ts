import { handle } from "@/lib/api";
import { getPublicSettings, saveSettings } from "@/lib/settings";

export const GET = () => handle(getPublicSettings);

export const POST = (req: Request) =>
  handle(async () => {
    await saveSettings(await req.json());
    return getPublicSettings();
  });
