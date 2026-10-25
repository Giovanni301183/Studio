// Imposta email e password del login nel file .env.local.
// Uso:  npm run set-password -- <email> <password>
// La password non viene salvata: si salva solo il suo hash.
// Per Vercel, copia poi AUTH_EMAIL, AUTH_PASSWORD_HASH e AUTH_SECRET nelle Environment Variables.
import { pbkdf2Sync, randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Uso: npm run set-password -- <email> <password>");
  process.exit(1);
}

const iterations = 210000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const values = {
  AUTH_EMAIL: email.trim().toLowerCase(),
  AUTH_PASSWORD_HASH: `pbkdf2:${iterations}:${salt.toString("base64url")}:${hash.toString("base64url")}`,
};

const file = ".env.local";
let env = existsSync(file) ? readFileSync(file, "utf8") : "";
// AUTH_SECRET si crea una volta sola: cambiarlo disconnette tutti
if (!/^AUTH_SECRET=.+$/m.test(env)) values.AUTH_SECRET = randomBytes(32).toString("base64url");

for (const [k, v] of Object.entries(values)) {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
}
writeFileSync(file, env);
console.log(`Login impostato per ${values.AUTH_EMAIL} in ${file}. Riavvia lo Studio.`);
