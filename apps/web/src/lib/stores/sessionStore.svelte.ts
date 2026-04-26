/**
 * Global Session Store
 *
 * Manages sharing session state globally so it persists across navigation.
 * Uses Svelte 5 runes with a singleton pattern for global access.
 */

import type { User, Song, QRSessionPayload, BootstrapSessionPayload, SongManifestEntry, SessionParticipantInfo } from '@gigwidget/core';

export type SessionStatus = 'disconnected' | 'connecting' | 'connected';

export interface SessionState {
  /** Whether a session is currently active */
  isActive: boolean;
  /** Whether the current user is the host */
  isHosting: boolean;
  /** Current session connection status */
  status: SessionStatus;
  /** Number of connected peers */
  peerCount: number;
  /** List of connected participants */
  participants: SessionParticipantInfo[];
  /** QR payload for the session (host only) */
  qrPayload: QRSessionPayload | null;
  /** QR code data URL (host only) */
  qrDataUrl: string | null;
  /** Whether the session panel is minimized */
  isMinimized: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether the user was ejected by the host */
  wasEjected: boolean;
}

// Singleton state - persists across navigation
let isActive = $state(false);
let isHosting = $state(false);
let status = $state<SessionStatus>('disconnected');
let peerCount = $state(0);
let participants = $state<SessionParticipantInfo[]>([]);
let qrPayload = $state<QRSessionPayload | null>(null);
let qrDataUrl = $state<string | null>(null);
let isMinimized = $state(false);
let error = $state<string | null>(null);
let wasEjected = $state(false);

// Internal references
let sessionManager: any = null;
let currentUser: User | null = null;
let bootstrapContext: BootstrapContext | null = null;

// Session lifecycle timers
const HOST_ABSENCE_TIMEOUT_MS = 30_000;
let expiryTimer: ReturnType<typeof setInterval> | null = null;
let hostAbsenceTimer: ReturnType<typeof setTimeout> | null = null;
let pagehideHandler: (() => void) | null = null;
let hasEverHadPeers = false;

function startExpiryTimer(): void {
  stopExpiryTimer();
  expiryTimer = setInterval(async () => {
    if (qrPayload?.expiresAt && Date.now() > qrPayload.expiresAt) {
      stopExpiryTimer();
      const { toast } = await import('./toastStore.svelte');
      toast.warning(
        isHosting ? 'Your hosting session has expired and has been ended.' : 'This session has expired.',
        6000
      );
      await leaveSession();
    }
  }, 60_000);
}

function stopExpiryTimer(): void {
  if (expiryTimer !== null) {
    clearInterval(expiryTimer);
    expiryTimer = null;
  }
}

function startHostAbsenceTimer(): void {
  if (isHosting || hostAbsenceTimer !== null) return;
  hostAbsenceTimer = setTimeout(async () => {
    hostAbsenceTimer = null;
    if (!isHosting && isActive) {
      const { toast } = await import('./toastStore.svelte');
      toast.warning('Host has disconnected.', 5000);
      await leaveSession();
    }
  }, HOST_ABSENCE_TIMEOUT_MS);
}

function stopHostAbsenceTimer(): void {
  if (hostAbsenceTimer !== null) {
    clearTimeout(hostAbsenceTimer);
    hostAbsenceTimer = null;
  }
}

function registerPagehideHandler(): void {
  if (typeof window === 'undefined') return;
  unregisterPagehideHandler();
  pagehideHandler = () => {
    if (sessionManager?.isHosting) {
      // Best-effort: Yjs write is synchronous even if the await never resolves
      sessionManager.leaveSession();
    }
  };
  window.addEventListener('pagehide', pagehideHandler);
}

function unregisterPagehideHandler(): void {
  if (pagehideHandler && typeof window !== 'undefined') {
    window.removeEventListener('pagehide', pagehideHandler);
    pagehideHandler = null;
  }
}

// ============================================================================
// Session recovery (localStorage)
// ============================================================================

export interface StoredHostSession {
  userId: string;
  payload: QRSessionPayload;
  shareAll: boolean;
  collectionId?: string;
  collectionName?: string;
}

const STORAGE_KEY = 'gigwidget:host-session';
let pendingSessionOptions: { shareAll: boolean; collectionId?: string; collectionName?: string } | null = null;

function saveHostSession(payload: QRSessionPayload): void {
  if (!pendingSessionOptions || !currentUser) return;
  try {
    const stored: StoredHostSession = { userId: currentUser.id, payload, ...pendingSessionOptions };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (err) {
    console.warn('[Session] Failed to save session to storage:', err);
  } finally {
    pendingSessionOptions = null;
  }
}

function clearStoredSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[Session] Failed to clear session from storage:', err);
  }
}

export function getStoredHostSession(userId: string): StoredHostSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredHostSession;
    if (stored.userId !== userId) return null;
    if (stored.payload.expiresAt && Date.now() > stored.payload.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

/**
 * Initialize the session manager with the current user
 */
async function initSessionManager(user: User): Promise<void> {
  if (sessionManager && currentUser?.id === user.id) return;

  currentUser = user;

  try {
    const { SessionManager } = await import('@gigwidget/sync');

    // Determine signaling servers based on environment
    let signalingServers: string[] = [];
    
    // Development: use local signaling server
    if (typeof window !== 'undefined') {
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isDev) {
        // Local development: connect to local y-websocket-server
        signalingServers = [
          `wss://${window.location.hostname}:4444`,
          `ws://${window.location.hostname}:4444`, // Fallback to ws for local dev
          'wss://signaling.yjs.dev', // Fallback to public
        ];
      } else {
        // Production: use deployed signaling server or public servers
        // Note: Railway server may need to be redeployed if connection is refused
        signalingServers = [
          'wss://gigwidget-signalling-server-production.up.railway.app',
          'wss://signaling.yjs.dev',
          'wss://y-webrtc-signaling-eu.herokuapp.com',
          'wss://y-webrtc-signaling-us.herokuapp.com',
        ];
      }
    }

    // Cleanup existing
    if (sessionManager) {
      sessionManager.destroy();
    }

    sessionManager = new SessionManager({ user, signalingServers });

    sessionManager.on('session-created', async ({ session, qrPayload: payload, songManifest }: any) => {
      console.log('[Session] session-created event received, manifest size:', songManifest?.length);
      isActive = true;
      isHosting = true;
      status = 'connected';
      // QR payload is kept small (no manifest), but we store the full payload for local UI
      qrPayload = { ...payload, libraryManifest: songManifest || [] };
      // Generate QR with ONLY the connection info (no manifest)
      await generateQR(payload);
      console.log('[Session] After generateQR, qrDataUrl is:', qrDataUrl ? 'set' : 'null');

      // Set up content provider for hosts
      sessionManager.setContentProvider(async (songId: string) => {
        try {
          const { ArrangementRepository } = await import('@gigwidget/db');
          const arrangements = await ArrangementRepository.getBySong(songId);
          return arrangements[0]?.content ?? null;
        } catch (err) {
          console.error('[Session] Failed to load content for:', songId, err);
          return null;
        }
      });

      saveHostSession(payload);
      startExpiryTimer();
      registerPagehideHandler();
    });

    sessionManager.on('session-joined', ({ session }: any) => {
      isActive = true;
      isHosting = false;
      status = 'connected';
      // Initialize qrPayload with session info - manifest comes later via WebRTC
      qrPayload = {
        sessionId: session.id,
        type: session.type,
        hostId: session.hostId,
        hostName: 'Host', // We don't have this from the session object
        connectionInfo: session.connectionInfo,
        libraryManifest: [], // Will be populated when manifest-received fires
        createdAt: session.createdAt.getTime(),
        expiresAt: session.expiresAt?.getTime(),
      };
      console.log('[Session] Joined session, waiting for manifest over WebRTC...');
      startExpiryTimer();
    });

    // Manifest received over WebRTC (for joiners)
    sessionManager.on('manifest-received', ({ manifest }: any) => {
      console.log('[Session] Manifest received over WebRTC:', manifest?.length, 'songs');
      if (qrPayload && manifest) {
        qrPayload = {
          ...qrPayload,
          libraryManifest: manifest,
        };
      }
    });

    sessionManager.on('session-left', () => {
      isActive = false;
      isHosting = false;
      status = 'disconnected';
      peerCount = 0;
      participants = [];
      qrPayload = null;
      qrDataUrl = null;
      // Don't clear wasEjected here - let it persist so UI can show message
      stopExpiryTimer();
      stopHostAbsenceTimer();
      unregisterPagehideHandler();
      hasEverHadPeers = false;
    });

    sessionManager.on('session-ended-by-host', async () => {
      console.log('[Session] Ejected by host');
      wasEjected = true;
      error = 'Session ended by host';

      // Show toast notification
      const { toast } = await import('./toastStore.svelte');
      toast.warning('Session ended by host', 5000);
    });

    sessionManager.on('peers-changed', ({ count }: any) => {
      peerCount = count;
      if (count > 0) hasEverHadPeers = true;
      if (!isHosting && isActive && hasEverHadPeers && count === 0) {
        startHostAbsenceTimer();
      } else if (count > 0) {
        stopHostAbsenceTimer();
      }
      console.log('Peers changed:', count);
    });

    sessionManager.on('participants-changed', ({ participants: newParticipants }: any) => {
      participants = newParticipants;
      peerCount = newParticipants.length + 1; // Include self
      console.log('Participants changed:', newParticipants);
    });

    sessionManager.on('sync-status', ({ synced }: any) => {
      status = synced ? 'connected' : 'connecting';
    });
  } catch (err) {
    console.error('Failed to init session manager:', err);
    error = err instanceof Error ? err.message : 'Failed to initialize session';
  }
}

/**
 * Generate QR code from payload
 */
async function generateQR(payload: QRSessionPayload): Promise<void> {
  try {
    const { generateQRCodeDataURL, estimateQRCodeSize } = await import('@gigwidget/sync');

    // Check if payload is too large for QR code
    const sizeInfo = estimateQRCodeSize(payload);
    console.log('[Session] QR payload size:', sizeInfo.bytes, 'bytes, too large:', sizeInfo.tooLarge);

    if (sizeInfo.tooLarge) {
      console.warn('[Session] QR payload may be too large for reliable scanning');
    }

    qrDataUrl = await generateQRCodeDataURL(payload);
    console.log('[Session] QR code generated successfully');
  } catch (err) {
    console.error('Failed to generate QR code:', err);
  }
}

/**
 * Start hosting a session
 */
async function startSession(
  user: User,
  songs: Song[],
  options: {
    shareAll?: boolean;
    collectionId?: string;
    collectionName?: string;
    password?: string;
  } = {}
): Promise<void> {
  await initSessionManager(user);
  if (!sessionManager) {
    error = 'Session manager not ready';
    return;
  }

  error = null;
  wasEjected = false;
  status = 'connecting';
  pendingSessionOptions = {
    shareAll: options.shareAll !== false,
    collectionId: options.collectionId,
    collectionName: options.collectionName,
  };

  try {
    // Songs are passed in already filtered by the caller
    // Keep manifest lightweight for QR codes - content is exchanged over WebRTC
    const manifest: SongManifestEntry[] = songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      tempo: s.tempo,
      tags: s.tags,
      instruments: [],
    }));

    await sessionManager.createSession(manifest, {
      type: 'webrtc',
      libraryScope: options.shareAll !== false ? 'full' : 'collection',
      collectionId: options.collectionId,
      collectionName: options.collectionName,
      password: options.password || undefined,
    });
  } catch (err) {
    console.error('Failed to start session:', err);
    error = err instanceof Error ? err.message : 'Failed to start session';
    status = 'disconnected';
  }
}

/**
 * Join an existing session
 */
async function joinSession(user: User, payload: QRSessionPayload): Promise<void> {
  await initSessionManager(user);
  if (!sessionManager) {
    error = 'Session manager not ready';
    return;
  }

  error = null;
  wasEjected = false;
  status = 'connecting';

  try {
    await sessionManager.joinSession({ payload });
  } catch (err) {
    console.error('Failed to join session:', err);
    error = err instanceof Error ? err.message : 'Failed to join session';
    status = 'disconnected';
  }
}

/**
 * Leave the current session
 */
async function leaveSession(): Promise<void> {
  clearStoredSession(); // intentional leave — clear recovery data
  if (sessionManager) {
    await sessionManager.leaveSession();
  }
  wasEjected = false;
  bootstrapContext = null;
}

/**
 * Resume hosting a previous session after a crash or reconnect.
 * Pass songs already filtered to match the original shareAll/collection scope.
 */
async function resumeSession(user: User, songs: Song[]): Promise<void> {
  await initSessionManager(user);
  if (!sessionManager) {
    error = 'Session manager not ready';
    return;
  }

  const stored = getStoredHostSession(user.id);
  if (!stored) {
    error = 'No stored session to resume';
    return;
  }

  error = null;
  wasEjected = false;
  status = 'connecting';
  pendingSessionOptions = {
    shareAll: stored.shareAll,
    collectionId: stored.collectionId,
    collectionName: stored.collectionName,
  };

  try {
    const manifest: SongManifestEntry[] = songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      tempo: s.tempo,
      tags: s.tags,
      instruments: [],
    }));

    const password =
      stored.payload.connectionInfo.type === 'webrtc'
        ? stored.payload.connectionInfo.password
        : undefined;

    await sessionManager.resumeSession(stored.payload, manifest, { password });
  } catch (err) {
    console.error('Failed to resume session:', err);
    error = err instanceof Error ? err.message : 'Failed to resume session';
    status = 'disconnected';
  }
}

/**
 * Request song content from the host (for joiners)
 * Returns the content if available, null otherwise
 */
async function requestSongContent(songId: string): Promise<string | null> {
  if (!sessionManager || !isActive) {
    return null;
  }
  return sessionManager.requestSongContent(songId);
}

/**
 * Get cached song content (sync, no network request)
 */
function getCachedContent(songId: string): string | null {
  if (!sessionManager) {
    return null;
  }
  return sessionManager.getCachedContent(songId);
}

/**
 * Check if song content is available
 */
function hasContent(songId: string): boolean {
  if (!sessionManager) {
    return false;
  }
  return sessionManager.hasContent(songId);
}

/**
 * Set transpose for a song (host only - syncs to all joiners)
 */
function setTranspose(songId: string, semitones: number): void {
  if (!sessionManager || !isHosting) return;
  sessionManager.setTranspose(songId, semitones);
}

/**
 * Get transpose for a song
 */
function getTranspose(songId: string): number {
  if (!sessionManager) return 0;
  return sessionManager.getTranspose(songId);
}

/**
 * Observe transpose changes for a song
 * Returns a cleanup function
 */
function observeTranspose(songId: string, callback: (semitones: number) => void): () => void {
  if (!sessionManager) return () => {};
  return sessionManager.observeTranspose(songId, callback);
}

/**
 * Update shared song content (host only - syncs to all joiners)
 * Call this when the host edits a song to propagate changes in real-time
 */
function updateSharedContent(songId: string, content: string): void {
  if (!sessionManager || !isHosting) return;
  sessionManager.updateSharedContent(songId, content);
}

/**
 * Observe content updates for a song (joiner only)
 * Returns a cleanup function to stop observing
 */
function observeContentUpdates(songId: string, callback: (content: string) => void): () => void {
  if (!sessionManager) return () => {};
  return sessionManager.observeContentUpdates(songId, callback);
}

/**
 * Get the current manifest (songs shared in this session)
 */
function getManifest(): SongManifestEntry[] {
  if (!sessionManager) return [];
  return sessionManager.getManifest();
}

/**
 * Join a session using an existing WebRTC connection from bootstrap.
 * Used when the app was loaded via P2P bootstrap.
 */
async function joinWithBootstrapContext(
  user: User,
  context: BootstrapContext
): Promise<{ songData: ArrayBuffer | undefined }> {
  await initSessionManager(user);
  if (!sessionManager) {
    error = 'Session manager not ready';
    throw new Error(error);
  }

  if (!context.payload) {
    error = 'No session payload in bootstrap context';
    throw new Error(error);
  }

  bootstrapContext = context;
  error = null;
  status = 'connecting';

  try {
    // Join the session normally - the WebRTC connection from bootstrap
    // will be handled by the session manager
    await sessionManager.joinSession({ payload: context.payload });

    // Return song data for the app to apply
    return { songData: context.songData };
  } catch (err) {
    console.error('Failed to join via bootstrap:', err);
    error = err instanceof Error ? err.message : 'Failed to join session';
    status = 'disconnected';
    throw err;
  }
}

/**
 * Check if we have a bootstrap context available
 */
function hasBootstrapContext(): boolean {
  return typeof window !== 'undefined' && !!window.__GIGWIDGET_BOOTSTRAP_CONTEXT__?.bootstrapComplete;
}

/**
 * Get the bootstrap context if available
 */
function getBootstrapContext(): BootstrapContext | null {
  if (typeof window === 'undefined') return null;
  return window.__GIGWIDGET_BOOTSTRAP_CONTEXT__ ?? null;
}

/**
 * Toggle minimized state
 */
function toggleMinimized(): void {
  isMinimized = !isMinimized;
}

/**
 * Expand the session panel
 */
function expand(): void {
  isMinimized = false;
}

/**
 * Minimize the session panel
 */
function minimize(): void {
  isMinimized = true;
}

/**
 * Get the session store - reactive state accessors and actions
 */
export function getSessionStore() {
  return {
    // Reactive getters
    get isActive() { return isActive; },
    get isHosting() { return isHosting; },
    get status() { return status; },
    get peerCount() { return peerCount; },
    get participants() { return participants; },
    get qrPayload() { return qrPayload; },
    get qrDataUrl() { return qrDataUrl; },
    get isMinimized() { return isMinimized; },
    get error() { return error; },
    get wasEjected() { return wasEjected; },

    // Actions
    startSession,
    joinSession,
    leaveSession,
    resumeSession,
    getStoredHostSession,
    toggleMinimized,
    expand,
    minimize,

    // Content sharing
    requestSongContent,
    getCachedContent,
    hasContent,
    getManifest,

    // Transpose sharing
    setTranspose,
    getTranspose,
    observeTranspose,

    // Content editing sync
    updateSharedContent,
    observeContentUpdates,

    // Bootstrap support
    joinWithBootstrapContext,
    hasBootstrapContext,
    getBootstrapContext,
  };
}
