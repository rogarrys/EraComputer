'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  sessionId: string;
  steamId: string;
  playerName: string;
  interactive: boolean;
}

// L'état partagé — TOUT le monde voit exactement la même chose
// C'est le serveur GMod qui est la source de vérité
interface SharedState {
  activeApp: string;
  youtube: {
    videoId: string;
    playing: boolean;
    startedAt: number;
    seekTime: number;
  };
  notepad: string;
  radio: {
    stationUrl: string;
    stationName: string;
    playing: boolean;
  };
  gallery: {
    imageUrl: string;
  };
  controller: {
    steamId: string;
    name: string;
  };
  viewers: { steamId: string; name: string }[];
}

// Bridge GMod — Le DHTML expose ces fonctions
declare global {
  interface Window {
    gmod?: {
      sendAction?: (json: string) => void;
      powerOff?: () => void;
      saveData?: (key: string, value: string) => void;
      loadData?: (key: string) => void;
      closeScreen?: () => void;
    };
    _eraReceiveState?: (state: SharedState) => void;
    _eraDataLoaded?: (key: string, data: string) => void;
  }
}

const DEFAULT_STATE: SharedState = {
  activeApp: 'desktop',
  youtube: { videoId: '', playing: false, startedAt: 0, seekTime: 0 },
  notepad: '',
  radio: { stationUrl: '', stationName: '', playing: false },
  gallery: { imageUrl: '' },
  controller: { steamId: '', name: '' },
  viewers: [],
};

export default function ComputerOS({ sessionId, steamId, playerName, interactive }: Props) {
  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [shared, setShared] = useState<SharedState>(DEFAULT_STATE);
  const [currentTime, setCurrentTime] = useState('');
  const [notifications, setNotifications] = useState<string[]>([]);
  const [isController, setIsController] = useState(false);
  const sharedRef = useRef(shared);

  useEffect(() => { sharedRef.current = shared; }, [shared]);

  // =====================
  // BRIDGE: recevoir l'état depuis le serveur GMod (via RunJavascript)
  // =====================
  useEffect(() => {
    window._eraReceiveState = (state: SharedState) => {
      if (!state) return;
      // Fusionner avec les valeurs par défaut pour les champs manquants
      const merged: SharedState = {
        ...DEFAULT_STATE,
        ...state,
        youtube: { ...DEFAULT_STATE.youtube, ...(state.youtube || {}) },
        radio: { ...DEFAULT_STATE.radio, ...(state.radio || {}) },
        gallery: { ...DEFAULT_STATE.gallery, ...(state.gallery || {}) },
        controller: { ...DEFAULT_STATE.controller, ...(state.controller || {}) },
        viewers: state.viewers || [],
      };
      setShared(merged);
      sharedRef.current = merged;
      setIsController(merged.controller.steamId === steamId);

      // Dès qu'on reçoit l'état du serveur, skip le boot
      setBooting(false);
    };

    window._eraDataLoaded = (key: string, data: string) => {
      console.log('[EraOS] Data loaded:', key, data);
    };

    // Signaler au serveur GMod qu'on est prêt à recevoir l'état
    const requestState = () => {
      try {
        if (window.gmod?.sendAction) {
          window.gmod.sendAction(JSON.stringify({ type: 'request_state' }));
        }
      } catch (e) { /* silencieux */ }
    };
    // Essayer immédiatement puis avec des délais (le bridge gmod peut ne pas être prêt)
    requestState();
    const t1 = setTimeout(requestState, 500);
    const t2 = setTimeout(requestState, 1500);
    const t3 = setTimeout(requestState, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      delete window._eraReceiveState;
      delete window._eraDataLoaded;
    };
  }, [steamId]);

  // =====================
  // BRIDGE: envoyer une action au serveur GMod (via gmod.sendAction)
  // =====================
  const sendAction = useCallback((action: object) => {
    try {
      if (window.gmod?.sendAction) {
        window.gmod.sendAction(JSON.stringify(action));
      }
    } catch (e) {
      console.error('[EraOS] sendAction error:', e);
    }
  }, []);

  // =====================
  // Pousser un changement d'état → serveur GMod
  // =====================
  const pushState = useCallback((newState: Partial<SharedState>) => {
    // Mise à jour optimiste locale immédiate
    const merged = { ...sharedRef.current, ...newState };
    setShared(merged);
    sharedRef.current = merged;

    // Envoyer au serveur GMod qui va broadcaster à tout le monde
    sendAction({ type: 'update_state', data: newState });
  }, [sendAction]);

  // =====================
  // BOOT ANIMATION
  // =====================
  useEffect(() => {
    const interval = setInterval(() => {
      setBootProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setBooting(false), 400);
          return 100;
        }
        return prev + Math.random() * 18 + 5;
      });
    }, 180);
    return () => clearInterval(interval);
  }, []);

  // =====================
  // HORLOGE
  // =====================
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, []);

  // =====================
  // Prendre le contrôle
  // =====================
  const takeControl = useCallback(() => {
    sendAction({ type: 'take_control' });
    setIsController(true);
    addNotification('Vous avez pris le controle');
  }, [sendAction]);

  // =====================
  // Ouvrir une app
  // =====================
  const openApp = useCallback((appId: string) => {
    if (!isController && shared.controller.steamId !== '') {
      addNotification(`${shared.controller.name} controle l'ordinateur`);
      return;
    }
    if (!isController) takeControl();
    pushState({ activeApp: appId });
  }, [isController, shared.controller, pushState, takeControl]);

  // =====================
  // Notifications
  // =====================
  const addNotification = useCallback((msg: string) => {
    setNotifications(prev => [...prev.slice(-4), msg]);
    setTimeout(() => setNotifications(prev => prev.slice(1)), 4000);
  }, []);

  // =====================
  // BOOT SCREEN
  // =====================
  if (booting) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#080818',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '2rem', color: '#00c8ff' }}>EraOS</div>
        <div style={{ width: '300px', height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(bootProgress, 100)}%`, height: '100%',
            background: 'linear-gradient(90deg, #00c8ff, #0080ff)',
            transition: 'width 0.15s',
          }} />
        </div>
        <div style={{ marginTop: '1rem', color: '#444', fontSize: '0.8rem' }}>Demarrage...</div>
      </div>
    );
  }

  // =====================
  // DESKTOP
  // =====================
  const apps = [
    { id: 'youtube', title: 'YouTube', icon: 'YT' },
    { id: 'radio', title: 'Radio', icon: 'FM' },
    { id: 'notepad', title: 'Bloc-notes', icon: 'TXT' },
    { id: 'gallery', title: 'Galerie', icon: 'IMG' },
    { id: 'viewers', title: 'Connectes', icon: 'NET' },
    { id: 'settings', title: 'Parametres', icon: 'CFG' },
  ];

  const viewers = shared.viewers || [];
  const canControl = isController || shared.controller.steamId === '' || shared.controller.steamId === steamId;

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'linear-gradient(135deg, #0a1628, #162a50, #0d1f3c)',
      position: 'relative', overflow: 'hidden', fontFamily: 'Arial, sans-serif',
    }}>
      {/* === CONTENU PRINCIPAL === */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '48px', overflow: 'hidden' }}>
        {shared.activeApp === 'desktop' && (
          <DesktopView apps={apps} onOpen={openApp} />
        )}
        {shared.activeApp === 'youtube' && (
          <YouTubeApp
            shared={shared}
            canControl={canControl}
            onUpdate={pushState}
            onBack={() => pushState({ activeApp: 'desktop' })}
            addNotification={addNotification}
          />
        )}
        {shared.activeApp === 'radio' && (
          <RadioApp
            shared={shared}
            canControl={canControl}
            onUpdate={pushState}
            onBack={() => pushState({ activeApp: 'desktop' })}
          />
        )}
        {shared.activeApp === 'notepad' && (
          <NotepadApp
            shared={shared}
            canControl={canControl}
            onUpdate={pushState}
            onBack={() => pushState({ activeApp: 'desktop' })}
          />
        )}
        {shared.activeApp === 'gallery' && (
          <GalleryApp
            shared={shared}
            canControl={canControl}
            onUpdate={pushState}
            onBack={() => pushState({ activeApp: 'desktop' })}
          />
        )}
        {shared.activeApp === 'viewers' && (
          <ViewersApp
            viewers={viewers}
            shared={shared}
            steamId={steamId}
            onBack={() => pushState({ activeApp: 'desktop' })}
            onTakeControl={takeControl}
            canControl={canControl}
          />
        )}
        {shared.activeApp === 'settings' && (
          <SettingsApp onBack={() => pushState({ activeApp: 'desktop' })} sessionId={sessionId} />
        )}
      </div>

      {/* === NOTIFICATIONS === */}
      <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 10000 }}>
        {notifications.map((n, i) => (
          <div key={i} style={{
            background: 'rgba(0,0,0,0.9)', color: '#00c8ff', padding: '10px 16px',
            borderRadius: '8px', fontSize: '0.85rem', borderLeft: '3px solid #00c8ff',
            animation: 'slideIn 0.3s ease', maxWidth: '300px',
          }}>
            {n}
          </div>
        ))}
      </div>

      {/* === BARRE DE CONTROLE === */}
      {shared.controller.steamId !== '' && !isController && (
        <div style={{
          position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', padding: '6px 16px', borderRadius: '20px',
          fontSize: '0.8rem', color: '#ffaa00', zIndex: 10000,
          border: '1px solid rgba(255,170,0,0.3)',
        }}>
          {shared.controller.name} controle l'ordinateur
          <span
            onClick={takeControl}
            style={{ marginLeft: '10px', color: '#00c8ff', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Prendre le controle
          </span>
        </div>
      )}

      {/* === TASKBAR === */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '48px',
        background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', padding: '0 8px',
        borderTop: '1px solid rgba(255,255,255,0.08)', zIndex: 9999,
      }}>
        <div
          onClick={() => canControl && pushState({ activeApp: 'desktop' })}
          style={{
            width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', color: '#00c8ff',
            background: shared.activeApp === 'desktop' ? 'rgba(0,200,255,0.2)' : 'transparent',
          }}
        >
          ERA
        </div>

        <div style={{ display: 'flex', gap: '2px', marginLeft: '6px', flex: 1 }}>
          {apps.map(app => (
            <div
              key={app.id}
              onClick={() => openApp(app.id)}
              style={{
                padding: '4px 10px', borderRadius: '4px', cursor: 'pointer',
                background: shared.activeApp === app.id ? 'rgba(0,200,255,0.25)' : 'rgba(255,255,255,0.03)',
                borderBottom: shared.activeApp === app.id ? '2px solid #00c8ff' : '2px solid transparent',
                color: '#ccc', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <span style={{ fontWeight: 'bold', color: '#00c8ff', fontSize: '0.7rem' }}>{app.icon}</span>
              <span>{app.title}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 10px' }}>
          {isController && <span style={{ fontSize: '0.7rem', color: '#00ff88', background: 'rgba(0,255,136,0.1)', padding: '2px 8px', borderRadius: '10px' }}>Controle</span>}
          <span style={{ fontSize: '0.75rem', color: '#888' }}>{viewers.length} en ligne</span>
          <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{currentTime}</span>
          <span
            onClick={() => { if (window.gmod?.powerOff) window.gmod.powerOff(); }}
            style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#f55', fontWeight: 'bold' }}
            title="Eteindre"
          >OFF</span>
        </div>
      </div>

      <style>{`
        @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

// ===============================
// BUREAU
// ===============================
function DesktopView({ apps, onOpen }: { apps: { id: string; title: string; icon: string }[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ padding: '30px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignContent: 'flex-start' }}>
      {apps.map(app => (
        <div
          key={app.id}
          onDoubleClick={() => onOpen(app.id)}
          onClick={() => onOpen(app.id)}
          style={{
            width: '90px', textAlign: 'center', cursor: 'pointer', padding: '12px 6px',
            borderRadius: '10px', transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{
            fontSize: '1.2rem', fontWeight: 'bold', color: '#00c8ff',
            width: '48px', height: '48px', margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,200,255,0.1)', borderRadius: '12px',
            border: '1px solid rgba(0,200,255,0.2)',
          }}>{app.icon}</div>
          <div style={{ fontSize: '0.75rem', color: '#ddd', textShadow: '1px 1px 3px #000', marginTop: '6px' }}>
            {app.title}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===============================
// APP BAR (en-tête d'app)
// ===============================
function AppBar({ title, icon, onBack }: { title: string; icon: string; onBack: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '8px 12px',
      background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(255,255,255,0.06)',
      gap: '8px',
    }}>
      <div onClick={onBack} style={{
        cursor: 'pointer', padding: '4px 10px', borderRadius: '4px',
        background: 'rgba(255,255,255,0.06)', color: '#aaa', fontSize: '0.85rem',
      }}>← Retour</div>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span style={{ color: '#ddd', fontSize: '0.95rem', fontWeight: 600 }}>{title}</span>
    </div>
  );
}

// ===============================
// YOUTUBE — Synchronisé avec timestamp
// ===============================
function YouTubeApp({ shared, canControl, onUpdate, onBack, addNotification }: {
  shared: SharedState; canControl: boolean;
  onUpdate: (s: Partial<SharedState>) => void; onBack: () => void;
  addNotification: (msg: string) => void;
}) {
  const [inputUrl, setInputUrl] = useState('');
  const yt = shared.youtube;

  const playVideo = (url?: string) => {
    if (!canControl) return;
    const target = url || inputUrl;
    const match = target.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (!match) {
      addNotification('Lien YouTube invalide');
      return;
    }
    const videoId = match[1];
    onUpdate({
      youtube: {
        videoId,
        playing: true,
        startedAt: Date.now(),
        seekTime: 0,
      }
    });
    setInputUrl('');
  };

  // Calculer le temps actuel de la vidéo pour les nouveaux arrivants
  const getEmbedUrl = () => {
    if (!yt.videoId) return '';
    // Calculer combien de secondes se sont écoulées depuis le démarrage
    let startSeconds = 0;
    if (yt.startedAt > 0) {
      startSeconds = Math.floor((Date.now() - yt.startedAt) / 1000) + (yt.seekTime || 0);
    }
    return `https://www.youtube.com/embed/${yt.videoId}?autoplay=1&start=${startSeconds}&rel=0&modestbranding=1`;
  };

  const suggestions = [
    { title: '🎵 LoFi Hip Hop Radio', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
    { title: '🌊 Ambiance Pluie', url: 'https://www.youtube.com/watch?v=mPZkdNFkNps' },
    { title: '🎮 Gaming Music Mix', url: 'https://www.youtube.com/watch?v=36YnV9STBqc' },
    { title: '😂 Rickroll', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f0f0f' }}>
      <AppBar title="YouTube Player" icon="▶️" onBack={onBack} />

      {/* Barre de recherche */}
      {canControl && (
        <div style={{
          display: 'flex', padding: '10px 12px', gap: '8px', background: 'rgba(0,0,0,0.4)',
          alignItems: 'center',
        }}>
          <input
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') playVideo(); }}
            placeholder="Coller un lien YouTube..."
            style={{
              flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px', padding: '8px 16px', color: '#fff', fontSize: '0.9rem', outline: 'none',
            }}
          />
          <button onClick={() => playVideo()} style={{
            background: '#ff0000', border: 'none', color: '#fff', borderRadius: '20px',
            padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold',
          }}>▶ Lire</button>
          {yt.videoId && (
            <button onClick={() => onUpdate({ youtube: { ...yt, videoId: '', playing: false, startedAt: 0, seekTime: 0 } })} style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#aaa', borderRadius: '20px',
              padding: '8px 16px', cursor: 'pointer',
            }}>⏹ Stop</button>
          )}
        </div>
      )}

      {/* Lecteur vidéo */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {yt.videoId ? (
          <iframe
            key={`${yt.videoId}_${yt.startedAt}`}
            src={getEmbedUrl()}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube"
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#555', padding: '20px' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>▶️</div>
            <p style={{ fontSize: '1.1rem', color: '#888' }}>Aucune vidéo en lecture</p>
            <p style={{ fontSize: '0.8rem', color: '#555', marginTop: '8px', marginBottom: '24px' }}>
              {canControl ? 'Collez un lien YouTube pour que tout le monde voie la même vidéo' : 'En attente d\'une vidéo...'}
            </p>
            {canControl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => playVideo(s.url)} style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px', padding: '10px 20px', color: '#ccc', cursor: 'pointer',
                    fontSize: '0.9rem', width: '280px', textAlign: 'left',
                  }}>
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status */}
      <div style={{
        padding: '6px 12px', background: 'rgba(0,0,0,0.5)', fontSize: '0.75rem',
        color: '#555', display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{yt.playing ? '▶ Lecture synchronisée' : '⏸ En attente'}</span>
        <span>🔊 Le son est partagé avec tous les joueurs</span>
      </div>
    </div>
  );
}

// ===============================
// RADIO / MUSIQUE
// ===============================
function RadioApp({ shared, canControl, onUpdate, onBack }: {
  shared: SharedState; canControl: boolean;
  onUpdate: (s: Partial<SharedState>) => void; onBack: () => void;
}) {
  const radio = shared.radio;

  const stations = [
    { name: '🎵 NRJ France', url: 'https://scdn.nrjaudio.fm/adwz2/fr/30001/mp3_128.mp3' },
    { name: '🎸 FIP Rock', url: 'https://icecast.radiofrance.fr/fiprock-midfi.mp3' },
    { name: '🎹 FIP Jazz', url: 'https://icecast.radiofrance.fr/fipjazz-midfi.mp3' },
    { name: '📻 France Inter', url: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3' },
    { name: '🎶 Skyrock', url: 'https://icecast.skyrock.net/s/natio_mp3_128k' },
    { name: '🌍 FIP Monde', url: 'https://icecast.radiofrance.fr/fipworld-midfi.mp3' },
  ];

  const playStation = (name: string, url: string) => {
    if (!canControl) return;
    onUpdate({ radio: { stationName: name, stationUrl: url, playing: true } });
  };

  const stop = () => {
    if (!canControl) return;
    onUpdate({ radio: { stationName: '', stationUrl: '', playing: false } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a1a' }}>
      <AppBar title="Radio / Musique" icon="🎵" onBack={onBack} />

      {/* Lecteur en cours */}
      {radio.playing && radio.stationUrl && (
        <div style={{
          padding: '16px', background: 'linear-gradient(135deg, rgba(0,200,255,0.1), rgba(128,0,255,0.1))',
          display: 'flex', alignItems: 'center', gap: '12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: '2rem', animation: 'pulse 2s infinite' }}>🎵</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>{radio.stationName}</div>
            <div style={{ color: '#00c8ff', fontSize: '0.8rem', marginTop: '2px' }}>En lecture — Tous les joueurs entendent</div>
          </div>
          {canControl && (
            <button onClick={stop} style={{
              background: 'rgba(255,50,50,0.2)', border: '1px solid rgba(255,50,50,0.3)',
              borderRadius: '20px', padding: '8px 16px', color: '#f55', cursor: 'pointer',
            }}>⏹ Arrêter</button>
          )}
          {/* Audio element caché — joue le stream pour tous */}
          <audio autoPlay src={radio.stationUrl} style={{ display: 'none' }} />
        </div>
      )}

      {/* Liste des stations */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '12px' }}>Stations de radio</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {stations.map((s, i) => (
            <div
              key={i}
              onClick={() => playStation(s.name, s.url)}
              style={{
                padding: '12px 16px', borderRadius: '8px', cursor: canControl ? 'pointer' : 'default',
                background: radio.stationUrl === s.url ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.03)',
                border: radio.stationUrl === s.url ? '1px solid rgba(0,200,255,0.3)' : '1px solid rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.15s',
                opacity: canControl ? 1 : 0.7,
              }}
            >
              <span style={{ fontSize: '1.3rem' }}>{s.name.split(' ')[0]}</span>
              <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{s.name.split(' ').slice(1).join(' ')}</span>
              {radio.stationUrl === s.url && <span style={{ marginLeft: 'auto', color: '#00c8ff', fontSize: '0.8rem' }}>▶ En cours</span>}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

// ===============================
// BLOC-NOTES — Partagé en temps réel
// ===============================
function NotepadApp({ shared, canControl, onUpdate, onBack }: {
  shared: SharedState; canControl: boolean;
  onUpdate: (s: Partial<SharedState>) => void; onBack: () => void;
}) {
  const [localText, setLocalText] = useState(shared.notepad);
  const debounceRef = useRef<any>(null);

  // Sync depuis le serveur
  useEffect(() => {
    if (!canControl) {
      setLocalText(shared.notepad);
    }
  }, [shared.notepad, canControl]);

  const handleChange = (text: string) => {
    setLocalText(text);
    // Debounce push
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate({ notepad: text });
    }, 500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar title="Bloc-notes (partagé)" icon="📝" onBack={onBack} />
      <textarea
        value={localText}
        onChange={e => canControl && handleChange(e.target.value)}
        readOnly={!canControl}
        style={{
          flex: 1, background: '#12122a', color: '#ddd', border: 'none',
          padding: '16px', fontSize: '0.95rem', resize: 'none', outline: 'none',
          fontFamily: 'Consolas, "Courier New", monospace', lineHeight: '1.7',
          opacity: canControl ? 1 : 0.8,
        }}
        placeholder={canControl ? 'Écrivez ici — tout le monde voit en temps réel...' : 'En lecture seule (quelqu\'un d\'autre contrôle)...'}
      />
      <div style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.4)', fontSize: '0.75rem', color: '#555' }}>
        {canControl ? '✏️ Vous éditez — visible par tous' : '👁️ Lecture seule'}
        <span style={{ float: 'right' }}>{localText.length} caractères</span>
      </div>
    </div>
  );
}

// ===============================
// GALERIE D'IMAGES
// ===============================
function GalleryApp({ shared, canControl, onUpdate, onBack }: {
  shared: SharedState; canControl: boolean;
  onUpdate: (s: Partial<SharedState>) => void; onBack: () => void;
}) {
  const [inputUrl, setInputUrl] = useState('');

  const showImage = (url?: string) => {
    if (!canControl) return;
    const target = url || inputUrl;
    if (!target) return;
    onUpdate({ gallery: { imageUrl: target } });
    setInputUrl('');
  };

  const sampleImages = [
    { title: '🌌 Galaxie', url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800' },
    { title: '🏔️ Montagne', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800' },
    { title: '🌅 Coucher de soleil', url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=800' },
    { title: '🌊 Océan', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0a0a' }}>
      <AppBar title="Galerie d'images" icon="🖼️" onBack={onBack} />

      {canControl && (
        <div style={{
          display: 'flex', padding: '10px 12px', gap: '8px', background: 'rgba(0,0,0,0.4)',
        }}>
          <input
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') showImage(); }}
            placeholder="Coller un lien d'image..."
            style={{
              flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none',
            }}
          />
          <button onClick={() => showImage()} style={{
            background: '#00c8ff', border: 'none', color: '#000', borderRadius: '6px',
            padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold',
          }}>Afficher</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {shared.gallery.imageUrl ? (
          <img
            src={shared.gallery.imageUrl}
            alt="Shared"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).src = ''; }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🖼️</div>
            <p style={{ color: '#666', marginBottom: '20px' }}>Aucune image affichée</p>
            {canControl && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {sampleImages.map((img, i) => (
                  <button key={i} onClick={() => showImage(img.url)} style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', padding: '10px 16px', color: '#ccc', cursor: 'pointer',
                  }}>{img.title}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===============================
// UTILISATEURS CONNECTÉS
// ===============================
function ViewersApp({ viewers, shared, steamId, onBack, onTakeControl, canControl }: {
  viewers: { steamId: string; name: string }[]; shared: SharedState; steamId: string;
  onBack: () => void; onTakeControl: () => void; canControl: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar title={`Connectés (${viewers.length})`} icon="👥" onBack={onBack} />

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* Contrôleur actuel */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '8px' }}>🎮 Contrôleur actuel</div>
          <div style={{
            background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.2)',
            borderRadius: '8px', padding: '12px',
          }}>
            {shared.controller.steamId ? (
              <span style={{ color: '#00c8ff' }}>{shared.controller.name} {shared.controller.steamId === steamId && '(vous)'}</span>
            ) : (
              <span style={{ color: '#666' }}>Personne — cliquez sur un app pour prendre le contrôle</span>
            )}
          </div>
          {!canControl && (
            <button onClick={onTakeControl} style={{
              marginTop: '8px', background: 'rgba(0,200,255,0.15)', border: '1px solid rgba(0,200,255,0.3)',
              borderRadius: '6px', padding: '8px 16px', color: '#00c8ff', cursor: 'pointer', width: '100%',
            }}>🎮 Prendre le contrôle</button>
          )}
        </div>

        {/* Liste des viewers */}
        <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '8px' }}>👥 Utilisateurs regardant cet écran</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {viewers.length === 0 ? (
            <div style={{ color: '#555', padding: '12px' }}>Aucun utilisateur connecté</div>
          ) : viewers.map((v, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '8px',
              border: v.steamId === shared.controller.steamId ? '1px solid rgba(0,200,255,0.2)' : '1px solid transparent',
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff88' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', color: '#ddd' }}>
                  {v.name} {v.steamId === steamId && <span style={{ color: '#888', fontSize: '0.75rem' }}>(vous)</span>}
                </div>
              </div>
              {v.steamId === shared.controller.steamId && (
                <span style={{ fontSize: '0.7rem', color: '#00c8ff', background: 'rgba(0,200,255,0.1)', padding: '2px 8px', borderRadius: '10px' }}>🎮 Contrôle</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===============================
// PARAMÈTRES
// ===============================
function SettingsApp({ onBack, sessionId }: { onBack: () => void; sessionId: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar title="Paramètres" icon="⚙️" onBack={onBack} />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: '#00c8ff', fontSize: '1rem', marginBottom: '10px' }}>À propos</h3>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '10px' }}>
            <p style={{ color: '#ddd', fontWeight: 600 }}>EraOS v1.0.0</p>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '6px' }}>
              Ordinateur synchronisé pour Garry's Mod
            </p>
            <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '8px' }}>
              Tous les joueurs regardant cet ordinateur voient exactement la même chose en temps réel,
              comme un partage d'écran Discord.
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: '#00c8ff', fontSize: '1rem', marginBottom: '10px' }}>Comment ça marche</h3>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '10px', fontSize: '0.85rem', color: '#aaa', lineHeight: '1.7' }}>
            <p>🎮 <strong>Contrôle</strong> — Un joueur à la fois contrôle l'ordinateur. Les autres voient en temps réel.</p>
            <p style={{ marginTop: '6px' }}>▶️ <strong>YouTube</strong> — La vidéo est synchronisée : même vidéo, même moment pour tous.</p>
            <p style={{ marginTop: '6px' }}>🎵 <strong>Radio</strong> — Le stream audio est joué pour chaque joueur connecté.</p>
            <p style={{ marginTop: '6px' }}>📝 <strong>Bloc-notes</strong> — Le texte est partagé en temps réel.</p>
          </div>
        </div>

        <div>
          <h3 style={{ color: '#888', fontSize: '0.85rem', marginBottom: '8px' }}>Session</h3>
          <div style={{
            background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '8px',
            fontSize: '0.75rem', color: '#555', fontFamily: 'monospace', wordBreak: 'break-all',
          }}>
            {sessionId}
          </div>
        </div>
      </div>
    </div>
  );
}
