import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get('boba_admin_session')?.value;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET || 'boba-auth-token';

  const isProtectedAdminRoute = request.nextUrl.pathname.startsWith('/admin');

  // If user tries to visit /admin without a valid cookie, redirect to /login
  if (isProtectedAdminRoute && sessionCookie !== sessionSecret) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If already logged in and visits /login, redirect directly to /admin
  if (request.nextUrl.pathname === '/login' && sessionCookie === sessionSecret) {
    const adminUrl = new URL('/admin', request.url);
    return NextResponse.redirect(adminUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};
