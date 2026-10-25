import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

// Ogni pagina e ogni API richiede il login, tranne la pagina di login stessa
export async function proxy(request: NextRequest) {
  const email = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (email) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Accesso non autorizzato: effettua il login" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/auth/|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
