import { NextResponse } from 'next/server';
import {
  getUniversalSyncSettings,
  updateUniversalSyncSettings,
} from '@/lib/sync-config';

export async function GET() {
  try {
    const settings = await getUniversalSyncSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch sync settings' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const updated = await updateUniversalSyncSettings(body);
    return NextResponse.json({ success: true, settings: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to update sync settings' },
      { status: 500 }
    );
  }
}

