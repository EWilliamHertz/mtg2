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

  // Bypass auth in local development if no cookie is present so you don't get trapped
  if (!isAuthenticated && process.env.NODE_ENV === 'development') {
    isAuthenticated = true; // Mock auth for local testing without Hatake SSO
  }

  if (!isAuthenticated) {
    // Pass the redirectUrl so Hatake can send us back!
    const returnUrl = encodeURIComponent(request.url);
    return NextResponse.redirect(`${HATAKE_LOGIN_URL}?redirectUrl=${returnUrl}`);
  }

  // If authenticated, bypass the legacy landing page, but let them access deck builder
  if (pathname === '/') {
    // With Next.js basePath configured, we can just redirect to /play
    return NextResponse.redirect(new URL("/play", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|socket.io).*)',
  ],
};
