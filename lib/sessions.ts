/*
  EraComputer - Session Store
  Stockage en mémoire des sessions d'ordinateur actives.
  Note: Sur Vercel serverless, le stockage en mémoire est éphémère.
  Pour la production, utiliser Redis/Upstash.
  Pour notre cas, on utilise un Map global + polling.
*/

export interface Session {
  sessionId: string;
  serverId: string;
  serverName: string;
  ownerSteamId: string;
  ownerName: string;
  currentUrl: string;
  viewers: Viewer[];
  createdAt: number;
  lastActivity: number;
  state: Record<string, any>;
}

export interface Viewer {
  steamId: string;
  name: string;
  joinedAt: number;
}

// Stockage global (persiste entre les invocations serverless tant que le conteneur est chaud)
declare global {
  var _eraSessions: Map<string, Session> | undefined;
  var _eraEvents: Map<string, SessionEvent[]> | undefined;
}

export interface SessionEvent {
  id: string;
  type: 'navigate' | 'state_update' | 'viewer_join' | 'viewer_leave' | 'power_off';
  sessionId: string;
  data: any;
  timestamp: number;
}

function getSessions(): Map<string, Session> {
  if (!global._eraSessions) {
    global._eraSessions = new Map();
  }
  return global._eraSessions;
}

function getEvents(): Map<string, SessionEvent[]> {
  if (!global._eraEvents) {
    global._eraEvents = new Map();
  }
  return global._eraEvents;
}

export function createSession(data: {
  sessionId: string;
  serverId: string;
  serverName: string;
  ownerSteamId: string;
  ownerName: string;
}): Session {
  const session: Session = {
    ...data,
    currentUrl: '',
    viewers: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    state: {},
  };

  getSessions().set(data.sessionId, session);
  getEvents().set(data.sessionId, []);

  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return getSessions().get(sessionId);
}

export function destroySession(sessionId: string): boolean {
  getEvents().delete(sessionId);
  return getSessions().delete(sessionId);
}

export function updateSessionUrl(sessionId: string, url: string, playerSteamId: string, playerName: string): boolean {
  const session = getSessions().get(sessionId);
  if (!session) return false;

  session.currentUrl = url;
  session.lastActivity = Date.now();

  // Ajouter un événement
  addEvent(sessionId, {
    type: 'navigate',
    data: { url, playerSteamId, playerName },
  });

  return true;
}

export function updateSessionState(sessionId: string, key: string, value: any): boolean {
  const session = getSessions().get(sessionId);
  if (!session) return false;

  session.state[key] = value;
  session.lastActivity = Date.now();

  addEvent(sessionId, {
    type: 'state_update',
    data: { key, value },
  });

  return true;
}

export function addViewer(sessionId: string, steamId: string, name: string): boolean {
  const session = getSessions().get(sessionId);
  if (!session) return false;

  // Ne pas ajouter si déjà présent
  if (session.viewers.find(v => v.steamId === steamId)) return true;

  session.viewers.push({ steamId, name, joinedAt: Date.now() });
  session.lastActivity = Date.now();

  addEvent(sessionId, {
    type: 'viewer_join',
    data: { steamId, name },
  });

  return true;
}

export function removeViewer(sessionId: string, steamId: string): boolean {
  const session = getSessions().get(sessionId);
  if (!session) return false;

  session.viewers = session.viewers.filter(v => v.steamId !== steamId);
  session.lastActivity = Date.now();

  return true;
}

function addEvent(sessionId: string, event: Omit<SessionEvent, 'id' | 'sessionId' | 'timestamp'>) {
  const events = getEvents().get(sessionId) || [];

  events.push({
    ...event,
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sessionId,
    timestamp: Date.now(),
  });

  // Garder seulement les 100 derniers événements
  if (events.length > 100) {
    events.splice(0, events.length - 100);
  }

  getEvents().set(sessionId, events);
}

export function getEventsSince(sessionId: string, since: number): SessionEvent[] {
  const events = getEvents().get(sessionId) || [];
  return events.filter(e => e.timestamp > since);
}

// Nettoyage des sessions inactives (> 30 min)
export function cleanupSessions() {
  const now = Date.now();
  const sessions = getSessions();

  for (const [id, session] of sessions) {
    if (now - session.lastActivity > 30 * 60 * 1000) {
      sessions.delete(id);
      getEvents().delete(id);
    }
  }
}
