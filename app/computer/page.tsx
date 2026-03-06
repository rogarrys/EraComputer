'use client';

import { useState, useEffect } from 'react';

// Chargement purement client-side — aucun SSR, aucune hydration
export default function ComputerPage() {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
  const [params, setParams] = useState<{ sessionId: string; steamId: string; playerName: string; interactive: boolean } | null>(null);

  useEffect(() => {
    // Lire les params depuis l'URL côté client uniquement
    const sp = new URLSearchParams(window.location.search);
    setParams({
      sessionId: sp.get('session') || '',
      steamId: sp.get('steamid') || '0',
      playerName: sp.get('name') || 'Player',
      interactive: sp.get('interactive') === '1',
    });

    // Import dynamique du composant
    import('./ComputerOS').then(mod => {
      setComponent(() => mod.default);
    });
  }, []);

  // Écran de chargement identique serveur/client — aucun mismatch possible
  if (!Component || !params) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100vw', height: '100vh', background: '#080818', color: '#00c8ff',
        fontFamily: 'Arial, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>EraOS</div>
          <div style={{ fontSize: '0.8rem', color: '#444' }}>Chargement...</div>
        </div>
      </div>
    );
  }

  if (!params.sessionId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100vw', height: '100vh', background: '#000', color: '#f00',
        fontFamily: 'Arial, sans-serif',
      }}>
        <p>Erreur: Pas de session ID</p>
      </div>
    );
  }

  return (
    <Component
      sessionId={params.sessionId}
      steamId={params.steamId}
      playerName={params.playerName}
      interactive={params.interactive}
    />
  );
}
