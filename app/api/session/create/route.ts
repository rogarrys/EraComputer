import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/sessions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, serverId, serverName, ownerSteamId, ownerName } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId requis' }, { status: 400 });
    }

    const session = createSession({
      sessionId,
      serverId: serverId || 'unknown',
      serverName: serverName || 'Unknown Server',
      ownerSteamId: ownerSteamId || '0',
      ownerName: ownerName || 'Unknown',
    });

    return NextResponse.json({ success: true, session });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
