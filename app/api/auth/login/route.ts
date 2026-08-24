import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    const correctPassword = process.env.ADMIN_PASSWORD || 'admin';
    const correctUsername = process.env.ADMIN_USERNAME || 'admin';

    if (username !== correctUsername || password !== correctPassword) {
      return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 });
    }

    const sessionSecret = process.env.ADMIN_SESSION_SECRET || 'boba-auth-token';
    const cookieStore = await cookies();

    // Set a secure HTTP-only session cookie (expires on browser close)
    cookieStore.set('boba_admin_session', sessionSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
