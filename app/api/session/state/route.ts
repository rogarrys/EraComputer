import { NextRequest, NextResponse } from 'next/server';
import { updateSessionState, getSession } from '@/lib/sessions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, key, value } = body;

    if (!sessionId || !key) {
      return NextResponse.json({ success: false, error: 'sessionId et key requis' }, { status: 400 });
    }

    const ok = updateSessionState(sessionId, key, value);

    if (!ok) {
      return NextResponse.json({ success: false, error: 'Session introuvable' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'sessionId requis' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Session introuvable' }, { status: 404 });
  }

  return NextResponse.json({ success: true, state: session.state });
}
