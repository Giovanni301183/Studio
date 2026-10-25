// Login con email e password, senza servizi esterni.
// Usa solo Web Crypto: funziona nel proxy, nelle API e su Vercel.
//
// Variabili d'ambiente (in .env.local e su Vercel):
//   AUTH_EMAIL          email autorizzata (più email separate da virgola)
//   AUTH_PASSWORD_HASH  hash della password (creato con: npm run set-password)
//   AUTH_SECRET         chiave casuale per firmare la sessione

export const SESSION_COOKIE = "studio_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");
const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function authConfigured() {
  return Boolean(process.env.AUTH_EMAIL && process.env.AUTH_PASSWORD_HASH && process.env.AUTH_SECRET);
}

export function allowedEmails() {
  return (process.env.AUTH_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Formato: pbkdf2:<iterazioni>:<sale>:<hash> (niente "$": nei file .env verrebbe letto come variabile) */
export async function hashPassword(password: string, iterations = 210_000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2:${iterations}:${b64url(salt)}:${b64url(await pbkdf2(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split(":");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const actual = await pbkdf2(password, fromB64url(salt), Number(iter));
  return timingSafeEqual(actual, fromB64url(hash));
}

async function hmac(data: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET mancante");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Sessione firmata: <dati>.<firma> */
export async function createSession(email: string) {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, exp: Date.now() + SESSION_DAYS * 86400_000 })));
  return `${payload}.${b64url(await hmac(payload))}`;
}

export async function readSession(token: string | undefined): Promise<string | null> {
  if (!token || !authConfigured()) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!timingSafeEqual(await hmac(payload), fromB64url(sig))) return null;
  try {
    const { e, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e: string; exp: number };
    if (Date.now() > exp || !allowedEmails().includes(e)) return null;
    return e;
  } catch {
    return null;
  }
}
