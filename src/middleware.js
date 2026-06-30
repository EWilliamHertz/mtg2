import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set.");
}
const JWT_SECRET = process.env.JWT_SECRET;
const jwtKey = new TextEncoder().encode(JWT_SECRET);
const HATAKE_COOKIE = "hatake_session";
const HATAKE_LOGIN_URL = process.env.NEXT_PUBLIC_HATAKE_URL 
  ? `${process.env.NEXT_PUBLIC_HATAKE_URL}/login`
  : "https://hatake.social/login";

export async function middleware(request) {
  const cookie = request.cookies.get(HATAKE_COOKIE)?.value;
  let isAuthenticated = false;

  if (cookie) {
    try {
      await jwtVerify(cookie, jwtKey, { algorithms: ["HS256"] });
      isAuthenticated = true;
    } catch (e) {
      // Invalid token
    }
  }

  const { pathname } = request.nextUrl;

  // Skip API routes here, they handle their own auth checks
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    return NextResponse.redirect(HATAKE_LOGIN_URL);
  }

  // If authenticated, bypass legacy menus and mount core Game Board (play)
  const legacyMenus = [
    "/",
    "/deck-builder",
    "/decks"
  ];

  if (legacyMenus.includes(pathname)) {
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const isProxied = forwardedHost.includes("hatake.social") || forwardedHost.includes("localhost");
    const targetPath = isProxied ? "/ouyrie/play" : "/play";
    
    return NextResponse.redirect(new URL(targetPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|socket.io).*)',
  ],
};
