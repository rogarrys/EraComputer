'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ComputerOS = dynamic(() => import('./ComputerOS'), { ssr: false });

function ComputerContent() {
  const params = useSearchParams();
  const sessionId = params.get('session') || '';
  const steamId = params.get('steamid') || '0';
  const playerName = params.get('name') || 'Player';
  const interactive = params.get('interactive') === '1';

  if (!sessionId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#000', color: '#f00',
      }}>
        <p>Erreur: Pas de session ID</p>
      </div>
    );
  }

  return (
    <ComputerOS
      sessionId={sessionId}
      steamId={steamId}
      playerName={playerName}
      interactive={interactive}
    />
  );
}

export default function ComputerPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#1a1a2e', color: '#00c8ff',
      }}>
        <p>Chargement...</p>
      </div>
    }>
      <ComputerContent />
    </Suspense>
  );
}
