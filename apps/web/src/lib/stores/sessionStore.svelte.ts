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

// Internal references
let sessionManager: any = null;
let currentUser: User | null = null;
let bootstrapContext: BootstrapContext | null = null;

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

    sessionManager.on('session-created', async ({ session, qrPayload: payload }: any) => {
      isActive = true;
      isHosting = true;
      status = 'connected';
      qrPayload = payload;
      await generateQR(payload);
    });

    sessionManager.on('session-joined', ({ session, manifest }: any) => {
      isActive = true;
      isHosting = false;
      status = 'connected';
      // Store the manifest so joiners can see the shared songs
      if (manifest) {
        qrPayload = {
          sessionId: session.id,
          type: session.type,
          hostId: session.hostId,
          hostName: 'Host', // We don't have this from the session object
          connectionInfo: session.connectionInfo,
          libraryManifest: manifest,
          createdAt: session.createdAt.getTime(),
          expiresAt: session.expiresAt?.getTime(),
        };
      }
      console.log('[Session] Joined session, manifest:', manifest?.length, 'songs');
    });

    sessionManager.on('session-left', () => {
      isActive = false;
      isHosting = false;
      status = 'disconnected';
      peerCount = 0;
      participants = [];
      qrPayload = null;
      qrDataUrl = null;
    });

    sessionManager.on('peers-changed', ({ count }: any) => {
      peerCount = count;
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
    const { generateQRCodeDataURL } = await import('@gigwidget/sync');
    qrDataUrl = await generateQRCodeDataURL(payload);
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
    selectedSongIds?: string[];
    password?: string;
  } = {}
): Promise<void> {
  await initSessionManager(user);
  if (!sessionManager) {
    error = 'Session manager not ready';
    return;
  }

  error = null;
  status = 'connecting';

  try {
    const songsToShare = options.shareAll !== false
      ? songs
      : songs.filter((s) => options.selectedSongIds?.includes(s.id));

    const manifest: SongManifestEntry[] = songsToShare.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      instruments: [], // TODO: Extract from song arrangements
    }));

    await sessionManager.createSession(manifest, {
      type: 'webrtc',
      libraryScope: options.shareAll !== false ? 'full' : 'selected',
      selectedSongIds: options.selectedSongIds,
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
  if (sessionManager) {
    await sessionManager.leaveSession();
  }
  bootstrapContext = null;
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

    // Actions
    startSession,
    joinSession,
    leaveSession,
    toggleMinimized,
    expand,
    minimize,

    // Bootstrap support
    joinWithBootstrapContext,
    hasBootstrapContext,
    getBootstrapContext,
  };
}
