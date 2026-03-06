import { NextRequest, NextResponse } from 'next/server';
import { getSession, getEventsSince, addViewer, cleanupSessions } from '@/lib/sessions';

// Long polling pour la synchronisation en temps réel
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const since = parseInt(req.nextUrl.searchParams.get('since') || '0');
  const steamId = req.nextUrl.searchParams.get('steamId') || '0';
  const name = req.nextUrl.searchParams.get('name') || 'Unknown';

  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'sessionId requis' }, { status: 400 });
  }

  // Nettoyage périodique
  cleanupSessions();

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Session introuvable' }, { status: 404 });
  }

  // Ajouter comme viewer
  addViewer(sessionId, steamId, name);

  // Récupérer les événements depuis le timestamp
  const events = getEventsSince(sessionId, since);

  return NextResponse.json({
    success: true,
    session: {
      sessionId: session.sessionId,
      currentUrl: session.currentUrl,
      viewers: session.viewers,
      state: session.state,
      ownerName: session.ownerName,
    },
    events,
    timestamp: Date.now(),
  });
}
