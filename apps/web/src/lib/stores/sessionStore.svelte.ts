/**
 * Global Session Store
 *
 * Manages sharing session state globally so it persists across navigation.
 * Uses Svelte 5 runes with a singleton pattern for global access.
 */

import type { User, Song, QRSessionPayload, SongManifestEntry } from '@gigwidget/core';

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
let qrPayload = $state<QRSessionPayload | null>(null);
let qrDataUrl = $state<string | null>(null);
let isMinimized = $state(false);
let error = $state<string | null>(null);

// Internal references
let sessionManager: any = null;
let currentUser: User | null = null;

/**
 * Initialize the session manager with the current user
 */
async function initSessionManager(user: User): Promise<void> {
  if (sessionManager && currentUser?.id === user.id) return;

  currentUser = user;

  try {
    const { SessionManager } = await import('@gigwidget/sync');

    // Cleanup existing
    if (sessionManager) {
      sessionManager.destroy();
    }

    sessionManager = new SessionManager({ user });

    sessionManager.on('session-created', async ({ session, qrPayload: payload }: any) => {
      isActive = true;
      isHosting = true;
      status = 'connected';
      qrPayload = payload;
      await generateQR(payload);
    });

    sessionManager.on('session-joined', ({ session }: any) => {
      isActive = true;
      isHosting = false;
      status = 'connected';
    });

    sessionManager.on('session-left', () => {
      isActive = false;
      isHosting = false;
      status = 'disconnected';
      peerCount = 0;
      qrPayload = null;
      qrDataUrl = null;
    });

    sessionManager.on('peers-changed', ({ count }: any) => {
      peerCount = count;
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
      key: s.key,
      updatedAt: s.updatedAt.getTime(),
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
  };
}
