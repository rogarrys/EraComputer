import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/sessions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId requis' }, { status: 400 });
    }

    destroySession(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
