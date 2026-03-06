import { NextRequest, NextResponse } from 'next/server';
import { updateSessionUrl } from '@/lib/sessions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, url, playerSteamId, playerName } = body;

    if (!sessionId || !url) {
      return NextResponse.json({ success: false, error: 'sessionId et url requis' }, { status: 400 });
    }

    const ok = updateSessionUrl(sessionId, url, playerSteamId || '0', playerName || 'Unknown');

    if (!ok) {
      return NextResponse.json({ success: false, error: 'Session introuvable' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
