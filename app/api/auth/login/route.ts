import { NextResponse } from "next/server";
import { allowedEmails, authConfigured, createSession, SESSION_COOKIE, SESSION_DAYS, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Login non configurato: mancano AUTH_EMAIL, AUTH_PASSWORD_HASH o AUTH_SECRET." }, { status: 503 });
  }
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const e = String(email ?? "").trim().toLowerCase();
  const ok = allowedEmails().includes(e) && (await verifyPassword(String(password ?? ""), process.env.AUTH_PASSWORD_HASH!));

  if (!ok) {
    // piccola attesa per rallentare i tentativi a caso
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: "Email o password non corrette" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(e), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
