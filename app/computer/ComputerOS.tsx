'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  sessionId: string;
  steamId: string;
  playerName: string;
  interactive: boolean;
}

interface AppWindow {
  id: string;
  title: string;
  icon: string;
  component: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  data?: any;
}

// Déclaration du bridge GMod
declare global {
  interface Window {
    gmod?: {
      navigate?: (url: string) => void;
      powerOff?: () => void;
      saveData?: (key: string, value: string) => void;
      loadData?: (key: string) => void;
      closeScreen?: () => void;
    };
    onSyncUpdate?: (url: string, playerName: string) => void;
    onDataLoaded?: (key: string, data: string) => void;
  }
}

export default function ComputerOS({ sessionId, steamId, playerName, interactive }: Props) {
  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [windows, setWindows] = useState<AppWindow[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [viewers, setViewers] = useState<{ steamId: string; name: string }[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [wallpaper, setWallpaper] = useState('linear-gradient(135deg, #0a2463, #1e3a5f, #2e5090)');
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(0);
  const nextZIndex = useRef(100);

  // Animation de boot
  useEffect(() => {
    const interval = setInterval(() => {
      setBootProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setBooting(false), 500);
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Horloge
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Polling de synchronisation
  useEffect(() => {
    if (booting) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/session/poll?sessionId=${sessionId}&since=${lastSyncTimestamp}&steamId=${steamId}&name=${encodeURIComponent(playerName)}`
        );
        const data = await res.json();

        if (data.success) {
          setViewers(data.session.viewers || []);
          setLastSyncTimestamp(data.timestamp);

          // Traiter les événements
          if (data.events && data.events.length > 0) {
            for (const event of data.events) {
              if (event.type === 'navigate') {
                addNotification(`${event.data.playerName} navigue vers une nouvelle page`);
              }
            }
          }
        }
      } catch (e) {
        // Silencieux en cas d'erreur
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [booting, sessionId, steamId, playerName, lastSyncTimestamp]);

  // Bridge GMod
  useEffect(() => {
    window.onSyncUpdate = (url: string, pName: string) => {
      addNotification(`${pName} a changé la page`);
      // Mettre à jour le navigateur si ouvert
      setWindows(prev => prev.map(w => {
        if (w.component === 'browser') {
          return { ...w, data: { ...w.data, url } };
        }
        return w;
      }));
    };

    window.onDataLoaded = (key: string, data: string) => {
      // Émettre un événement custom
      window.dispatchEvent(new CustomEvent('eraDataLoaded', { detail: { key, data } }));
    };
  }, []);

  const addNotification = useCallback((msg: string) => {
    setNotifications(prev => [...prev, msg]);
    setTimeout(() => {
      setNotifications(prev => prev.slice(1));
    }, 4000);
  }, []);

  // Gestion des fenêtres
  const openApp = useCallback((appId: string, title: string, icon: string, component: string, data?: any) => {
    // Vérifier si déjà ouvert
    const existing = windows.find(w => w.id === appId);
    if (existing) {
      setActiveWindowId(appId);
      setWindows(prev => prev.map(w =>
        w.id === appId ? { ...w, minimized: false, zIndex: ++nextZIndex.current } : w
      ));
      return;
    }

    const newWindow: AppWindow = {
      id: appId,
      title,
      icon,
      component,
      x: 50 + Math.random() * 200,
      y: 50 + Math.random() * 100,
      width: 800,
      height: 550,
      minimized: false,
      maximized: false,
      zIndex: ++nextZIndex.current,
      data,
    };

    setWindows(prev => [...prev, newWindow]);
    setActiveWindowId(appId);
    setStartMenuOpen(false);
  }, [windows]);

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => prev.filter(w => w.id !== id));
    if (activeWindowId === id) setActiveWindowId(null);
  }, [activeWindowId]);

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, minimized: true } : w
    ));
  }, []);

  const maximizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, maximized: !w.maximized } : w
    ));
  }, []);

  const focusWindow = useCallback((id: string) => {
    setActiveWindowId(id);
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, zIndex: ++nextZIndex.current, minimized: false } : w
    ));
  }, []);

  // Apps disponibles
  const apps = [
    { id: 'browser', title: 'Navigateur Web', icon: '🌐', component: 'browser' },
    { id: 'youtube', title: 'YouTube Player', icon: '▶️', component: 'youtube' },
    { id: 'notepad', title: 'Bloc-notes', icon: '📝', component: 'notepad' },
    { id: 'settings', title: 'Paramètres', icon: '⚙️', component: 'settings' },
    { id: 'files', title: 'Fichiers', icon: '📁', component: 'files' },
    { id: 'viewers', title: 'Utilisateurs connectés', icon: '👥', component: 'viewers' },
  ];

  // Écran de boot
  if (booting) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#0a0a1a',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '2rem', color: '#00c8ff' }}>🖥️ EraOS</div>
        <div style={{ width: '300px', height: '4px', background: '#222', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(bootProgress, 100)}%`, height: '100%',
            background: 'linear-gradient(90deg, #00c8ff, #0080ff)',
            transition: 'width 0.2s',
          }} />
        </div>
        <div style={{ marginTop: '1rem', color: '#555', fontSize: '0.8rem' }}>
          Démarrage du système...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', background: wallpaper,
      position: 'relative', overflow: 'hidden', userSelect: 'none',
    }}>
      {/* Desktop Icons */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', position: 'absolute', top: 0, left: 0 }}>
        {apps.map((app, i) => (
          <div
            key={app.id}
            onDoubleClick={() => openApp(app.id, app.title, app.icon, app.component)}
            style={{
              width: '80px', textAlign: 'center', cursor: 'pointer', padding: '8px',
              borderRadius: '8px', transition: 'background 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontSize: '2rem' }}>{app.icon}</div>
            <div style={{ fontSize: '0.7rem', color: '#fff', textShadow: '1px 1px 2px #000', marginTop: '4px' }}>
              {app.title}
            </div>
          </div>
        ))}
      </div>

      {/* Windows */}
      {windows.filter(w => !w.minimized).map(win => (
        <WindowComponent
          key={win.id}
          win={win}
          isActive={activeWindowId === win.id}
          onClose={() => closeWindow(win.id)}
          onMinimize={() => minimizeWindow(win.id)}
          onMaximize={() => maximizeWindow(win.id)}
          onFocus={() => focusWindow(win.id)}
          onMove={(x, y) => setWindows(prev => prev.map(w => w.id === win.id ? { ...w, x, y } : w))}
          sessionId={sessionId}
          steamId={steamId}
          playerName={playerName}
          viewers={viewers}
          interactive={interactive}
        />
      ))}

      {/* Notifications */}
      <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 10000 }}>
        {notifications.map((n, i) => (
          <div key={i} style={{
            background: 'rgba(0,0,0,0.85)', color: '#00c8ff', padding: '10px 15px',
            borderRadius: '8px', fontSize: '0.85rem', borderLeft: '3px solid #00c8ff',
            animation: 'slideIn 0.3s ease',
          }}>
            {n}
          </div>
        ))}
      </div>

      {/* Taskbar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '48px',
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', padding: '0 8px',
        borderTop: '1px solid rgba(255,255,255,0.1)', zIndex: 9999,
      }}>
        {/* Start Button */}
        <div
          onClick={() => setStartMenuOpen(!startMenuOpen)}
          style={{
            width: '40px', height: '40px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', borderRadius: '4px',
            background: startMenuOpen ? 'rgba(0,200,255,0.3)' : 'transparent',
            fontSize: '1.3rem', transition: 'background 0.2s',
          }}
          onMouseEnter={e => { if (!startMenuOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={e => { if (!startMenuOpen) e.currentTarget.style.background = 'transparent'; }}
        >
          🖥️
        </div>

        {/* Window Buttons */}
        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flex: 1 }}>
          {windows.map(win => (
            <div
              key={win.id}
              onClick={() => focusWindow(win.id)}
              style={{
                padding: '4px 12px', borderRadius: '4px', cursor: 'pointer',
                background: activeWindowId === win.id ? 'rgba(0,200,255,0.3)' : 'rgba(255,255,255,0.05)',
                color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px',
                borderBottom: activeWindowId === win.id ? '2px solid #00c8ff' : '2px solid transparent',
                maxWidth: '150px', overflow: 'hidden', whiteSpace: 'nowrap',
              }}
            >
              <span>{win.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{win.title}</span>
            </div>
          ))}
        </div>

        {/* System Tray */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 10px' }}>
          <span style={{ fontSize: '0.75rem', color: '#888' }}>
            👥 {viewers.length}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{currentTime}</span>
        </div>
      </div>

      {/* Start Menu */}
      {startMenuOpen && (
        <div style={{
          position: 'absolute', bottom: '52px', left: '4px', width: '280px',
          background: 'rgba(20,20,30,0.95)', backdropFilter: 'blur(20px)',
          borderRadius: '8px 8px 0 0', border: '1px solid rgba(255,255,255,0.1)',
          zIndex: 10000, overflow: 'hidden',
        }}>
          <div style={{ padding: '15px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ color: '#00c8ff', fontWeight: 'bold', fontSize: '1rem' }}>EraOS</div>
            <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '2px' }}>{playerName}</div>
          </div>

          {apps.map(app => (
            <div
              key={app.id}
              onClick={() => openApp(app.id, app.title, app.icon, app.component)}
              style={{
                padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: '10px', transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,200,255,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '1.2rem' }}>{app.icon}</span>
              <span style={{ color: '#ddd', fontSize: '0.9rem' }}>{app.title}</span>
            </div>
          ))}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '5px' }}>
            <div
              onClick={() => {
                if (window.gmod?.powerOff) window.gmod.powerOff();
              }}
              style={{
                padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: '10px', borderRadius: '4px',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,50,50,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '1.2rem' }}>⏻</span>
              <span style={{ color: '#f55', fontSize: '0.9rem' }}>Éteindre</span>
            </div>
          </div>
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ==============================
// Composant Fenêtre
// ==============================
function WindowComponent({ win, isActive, onClose, onMinimize, onMaximize, onFocus, onMove, sessionId, steamId, playerName, viewers, interactive }: {
  win: AppWindow;
  isActive: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  sessionId: string;
  steamId: string;
  playerName: string;
  viewers: { steamId: string; name: string }[];
  interactive: boolean;
}) {
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null);

  const style: React.CSSProperties = win.maximized
    ? { position: 'absolute', top: 0, left: 0, width: '100%', height: 'calc(100% - 48px)', zIndex: win.zIndex }
    : { position: 'absolute', top: win.y, left: win.x, width: win.width, height: win.height, zIndex: win.zIndex };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (win.maximized) return;
    onFocus();
    dragRef.current = { startX: e.clientX, startY: e.clientY, winX: win.x, winY: win.y };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      onMove(dragRef.current.winX + dx, dragRef.current.winY + dy);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div style={{
      ...style,
      background: 'rgba(25,25,35,0.96)',
      borderRadius: win.maximized ? 0 : '8px',
      border: isActive ? '1px solid rgba(0,200,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column',
      boxShadow: isActive ? '0 8px 32px rgba(0,0,0,0.6)' : '0 4px 16px rgba(0,0,0,0.4)',
    }}
      onClick={onFocus}
    >
      {/* Title Bar */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          height: '32px', background: isActive ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', padding: '0 8px',
          borderRadius: win.maximized ? 0 : '8px 8px 0 0', cursor: 'move',
        }}
      >
        <span style={{ marginRight: '6px' }}>{win.icon}</span>
        <span style={{ flex: 1, fontSize: '0.8rem', color: isActive ? '#fff' : '#888', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {win.title}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <WinButton onClick={onMinimize} color="#ffbd44">−</WinButton>
          <WinButton onClick={onMaximize} color="#00ca4e">□</WinButton>
          <WinButton onClick={onClose} color="#ff605c">×</WinButton>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {win.component === 'browser' && <BrowserApp sessionId={sessionId} steamId={steamId} playerName={playerName} data={win.data} />}
        {win.component === 'youtube' && <YouTubeApp sessionId={sessionId} steamId={steamId} playerName={playerName} />}
        {win.component === 'notepad' && <NotepadApp sessionId={sessionId} steamId={steamId} />}
        {win.component === 'settings' && <SettingsApp />}
        {win.component === 'files' && <FilesApp />}
        {win.component === 'viewers' && <ViewersApp viewers={viewers} />}
      </div>
    </div>
  );
}

function WinButton({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: '14px', height: '14px', borderRadius: '50%', background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: '10px', color: 'transparent', lineHeight: '1',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = '#000')}
      onMouseLeave={e => (e.currentTarget.style.color = 'transparent')}
    >
      {children}
    </div>
  );
}

// ==============================
// Applications
// ==============================

function BrowserApp({ sessionId, steamId, playerName, data }: { sessionId: string; steamId: string; playerName: string; data?: any }) {
  const [url, setUrl] = useState(data?.url || 'https://www.google.com');
  const [inputUrl, setInputUrl] = useState(data?.url || 'https://www.google.com');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigate = (newUrl: string) => {
    let finalUrl = newUrl;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);

    // Sync via API
    fetch('/api/session/navigate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, url: finalUrl, playerSteamId: steamId, playerName }),
    });

    // Bridge GMod
    if (window.gmod?.navigate) {
      window.gmod.navigate(finalUrl);
    }
  };

  useEffect(() => {
    if (data?.url && data.url !== url) {
      setUrl(data.url);
      setInputUrl(data.url);
    }
  }, [data?.url]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* URL Bar */}
      <div style={{
        display: 'flex', padding: '6px 8px', background: 'rgba(0,0,0,0.3)',
        gap: '6px', alignItems: 'center',
      }}>
        <button onClick={() => navigate(url)} style={navBtnStyle}>🔄</button>
        <button onClick={() => navigate('https://www.google.com')} style={navBtnStyle}>🏠</button>
        <input
          type="text"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') navigate(inputUrl); }}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '4px', padding: '4px 10px', color: '#fff', fontSize: '0.85rem',
            outline: 'none',
          }}
          placeholder="Entrez une URL..."
        />
        <button onClick={() => navigate(inputUrl)} style={{ ...navBtnStyle, background: '#00c8ff', color: '#000' }}>→</button>
      </div>

      {/* Web Content */}
      <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
        <iframe
          ref={iframeRef}
          src={url}
          style={{ width: '100%', height: '100%', border: 'none' }}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          title="Browser"
        />
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff',
  borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.9rem',
};

function YouTubeApp({ sessionId, steamId, playerName }: { sessionId: string; steamId: string; playerName: string }) {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [syncedVideoId, setSyncedVideoId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  const extractVideoId = (url: string): string => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : '';
  };

  const playVideo = (url?: string) => {
    const targetUrl = url || videoUrl;
    const id = extractVideoId(targetUrl);
    if (!id) return;

    setVideoId(id);
    setIsPlaying(true);

    // Synchroniser via l'API
    fetch('/api/session/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        key: 'youtube',
        value: { videoId: id, playing: true, timestamp: Date.now(), startedBy: playerName },
      }),
    });

    // Sync via GMod
    if (window.gmod?.navigate) {
      window.gmod.navigate(`youtube:${id}`);
    }
  };

  // Polling pour synchroniser la vidéo
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/session/state?sessionId=${sessionId}`);
        const data = await res.json();
        if (data.success && data.state?.youtube) {
          const yt = data.state.youtube;
          if (yt.videoId && yt.videoId !== syncedVideoId) {
            setSyncedVideoId(yt.videoId);
            setVideoId(yt.videoId);
            setIsPlaying(yt.playing);
          }
        }
      } catch (e) { /* silence */ }
    };

    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [sessionId, syncedVideoId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f0f0f' }}>
      {/* Search Bar */}
      <div style={{
        display: 'flex', padding: '10px', gap: '8px', background: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '1.3rem' }}>▶️</span>
        <input
          type="text"
          value={videoUrl}
          onChange={e => setVideoUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') playVideo(); }}
          placeholder="Coller un lien YouTube ici..."
          style={{
            flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px', padding: '8px 16px', color: '#fff', fontSize: '0.9rem',
            outline: 'none',
          }}
        />
        <button
          onClick={() => playVideo()}
          style={{
            background: '#ff0000', border: 'none', color: '#fff', borderRadius: '20px',
            padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem',
          }}
        >
          ▶ Lire
        </button>
      </div>

      {/* Video Player */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {videoId ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube Player"
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#555' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>▶️</div>
            <p style={{ fontSize: '1.1rem' }}>Collez un lien YouTube pour lire une vidéo</p>
            <p style={{ fontSize: '0.8rem', color: '#444', marginTop: '0.5rem' }}>
              La vidéo sera synchronisée avec tous les joueurs
            </p>

            {/* Suggestions */}
            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ color: '#666', fontSize: '0.8rem' }}>Essayez :</p>
              {[
                { title: 'Musique LoFi', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
                { title: 'Rickroll', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
              ].map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setVideoUrl(s.url); playVideo(s.url); }}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '8px 16px', color: '#aaa', cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{
        padding: '6px 12px', background: 'rgba(0,0,0,0.5)', fontSize: '0.75rem',
        color: '#666', display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{isPlaying ? '▶ Lecture en cours' : '⏸ En pause'}</span>
        <span>Synchronisé avec la session</span>
      </div>
    </div>
  );
}

function NotepadApp({ sessionId, steamId }: { sessionId: string; steamId: string }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  const save = () => {
    // Sauvegarder via l'API de session
    fetch('/api/session/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, key: 'notepad', value: text }),
    });

    // Aussi via GMod
    if (window.gmod?.saveData) {
      window.gmod.saveData('notepad', text);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Charger le texte existant
  useEffect(() => {
    fetch(`/api/session/state?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.state?.notepad) {
          setText(data.state.notepad);
        }
      })
      .catch(() => {});
  }, [sessionId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', padding: '4px 8px', background: 'rgba(0,0,0,0.3)',
        gap: '4px', fontSize: '0.8rem',
      }}>
        <button onClick={save} style={menuBtnStyle}>
          💾 Sauvegarder {saved && '✓'}
        </button>
        <button onClick={() => setText('')} style={menuBtnStyle}>🗑️ Effacer</button>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        style={{
          flex: 1, background: '#1a1a2e', color: '#ddd', border: 'none',
          padding: '12px', fontSize: '0.9rem', resize: 'none', outline: 'none',
          fontFamily: 'Consolas, monospace', lineHeight: '1.6',
        }}
        placeholder="Écrivez quelque chose..."
      />
    </div>
  );
}

const menuBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer',
  padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
};

function SettingsApp() {
  return (
    <div style={{ padding: '20px', color: '#ccc' }}>
      <h2 style={{ color: '#00c8ff', marginBottom: '20px' }}>⚙️ Paramètres</h2>

      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '10px' }}>Apparence</h3>
        <p style={{ color: '#888', fontSize: '0.85rem' }}>Le fond d'écran et les thèmes seront disponibles dans une future mise à jour.</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '10px' }}>À propos</h3>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', fontSize: '0.85rem' }}>
          <p><strong>EraOS</strong> v1.0.0</p>
          <p style={{ color: '#888', marginTop: '5px' }}>Système d'ordinateur synchronisé pour Garry's Mod</p>
          <p style={{ color: '#666', marginTop: '5px' }}>Tous les joueurs qui regardent cet ordinateur voient la même chose en temps réel.</p>
        </div>
      </div>
    </div>
  );
}

function FilesApp() {
  return (
    <div style={{ padding: '20px', color: '#ccc' }}>
      <h2 style={{ color: '#00c8ff', marginBottom: '20px' }}>📁 Fichiers</h2>
      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px' }}>
        <p style={{ color: '#888', fontSize: '0.85rem' }}>
          Le gestionnaire de fichiers est en cours de développement.
          Les données sont sauvegardées localement sur le serveur.
        </p>
      </div>
    </div>
  );
}

function ViewersApp({ viewers }: { viewers: { steamId: string; name: string }[] }) {
  return (
    <div style={{ padding: '20px', color: '#ccc' }}>
      <h2 style={{ color: '#00c8ff', marginBottom: '20px' }}>👥 Utilisateurs connectés ({viewers.length})</h2>

      {viewers.length === 0 ? (
        <p style={{ color: '#888' }}>Aucun utilisateur connecté</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {viewers.map((v, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(0,0,0,0.3)', padding: '10px 15px', borderRadius: '8px',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%', background: '#00ff88',
              }} />
              <div>
                <div style={{ fontSize: '0.9rem' }}>{v.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#666' }}>Steam: {v.steamId}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
