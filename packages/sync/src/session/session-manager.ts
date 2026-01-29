/**
 * Session Manager for Ad-hoc P2P Sharing
 *
 * Manages ephemeral sessions for sharing content at jam sessions,
 * workshops, and other in-person gatherings.
 *
 * Features:
 * - Create/host sessions
 * - Generate QR codes for easy joining
 * - Manage multiple transport types (WebRTC, Bluetooth, Local Network)
 * - Track participants and sync status
 */

import * as Y from 'yjs';
import type {
  Session,
  SessionType,
  QRSessionPayload,
  BootstrapSessionPayload,
  SongManifestEntry,
  User,
  AwarenessParticipant,
  SessionParticipantInfo,
} from '@gigwidget/core';
import { createSession, generateId } from '@gigwidget/core';
import { WebrtcProvider } from 'y-webrtc';
import { BluetoothProvider, isBluetoothAvailable } from '../providers/index.js';
import { Observable } from '../providers/observable.js';
import { BootstrapHost, BOOTSTRAP_CHANNEL_LABEL } from '../bootstrap/index.js';
import { BootstrapSignaling } from './bootstrap-signaling.js';

// Default WebRTC signaling servers - using more reliable options
const DEFAULT_SIGNALING_SERVERS = [
  'wss://signaling.yjs.dev',
  'wss://y-webrtc-signaling-eu.herokuapp.com',
  'wss://y-webrtc-signaling-us.herokuapp.com',
];

export interface SessionManagerOptions {
  /** Current user */
  user: User;
  /** Custom signaling servers for WebRTC */
  signalingServers?: string[];
  /** Default session expiry in ms */
  defaultExpiryMs?: number;
}

export interface CreateSessionOptions {
  type?: SessionType;
  libraryScope?: 'full' | 'selected';
  selectedSongIds?: string[];
  expiresInMs?: number;
  password?: string;
  /** Enable bootstrap mode for app + data transfer to new devices */
  enableBootstrap?: boolean;
  /** Pre-loaded app bundle for bootstrap (Brotli compressed) */
  appBundle?: ArrayBuffer;
  /** Song Yjs documents to share during bootstrap */
  songDocs?: Map<string, Y.Doc>;
}

export interface JoinSessionOptions {
  payload: QRSessionPayload;
}

export class SessionManager extends Observable {
  private activeSession: Session | null = null;
  private sessionDoc: Y.Doc | null = null;
  private webrtcProvider: WebrtcProvider | null = null;
  private bluetoothProvider: BluetoothProvider | null = null;
  private bootstrapHost: BootstrapHost | null = null;
  private bootstrapSignaling: BootstrapSignaling | null = null;
  private avatarThumbnail: string | undefined;

  // Song content sharing
  private songContentMap: Y.Map<string> | null = null;
  private contentRequests: Y.Map<number> | null = null;
  private contentProvider: ((songId: string) => Promise<string | null>) | null = null;

  // Transpose state sharing (host controls, joiners observe)
  private transposeStateMap: Y.Map<number> | null = null;

  readonly user: User;
  private readonly signalingServers: string[];
  private readonly defaultExpiryMs: number;

  constructor(options: SessionManagerOptions) {
    super();
    this.user = options.user;
    this.signalingServers = options.signalingServers ?? DEFAULT_SIGNALING_SERVERS;
    this.defaultExpiryMs = options.defaultExpiryMs ?? 4 * 60 * 60 * 1000; // 4 hours

    // Create avatar thumbnail for awareness sharing
    this.createAvatarThumbnail();
  }

  /**
   * Create a small thumbnail from avatar blob for sharing via awareness.
   * Keeps size under 5KB for efficient P2P transfer.
   */
  private async createAvatarThumbnail(): Promise<void> {
    if (!this.user.avatar) {
      this.avatarThumbnail = undefined;
      return;
    }

    try {
      const img = new Image();
      const url = URL.createObjectURL(this.user.avatar);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      const size = 48;
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, size, size);

      this.avatarThumbnail = canvas.toDataURL('image/jpeg', 0.5);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create avatar thumbnail:', err);
      this.avatarThumbnail = undefined;
    }
  }

  get isHosting(): boolean {
    return this.activeSession?.hostId === this.user.id;
  }

  get currentSession(): Session | null {
    return this.activeSession;
  }

  /**
   * Detect the best available transport type
   */
  detectBestTransport(): SessionType {
    // Check network availability
    const hasNetwork = typeof navigator !== 'undefined' && navigator.onLine;

    if (hasNetwork) {
      return 'webrtc';
    }

    if (isBluetoothAvailable()) {
      return 'bluetooth';
    }

    // Fallback to local network (mDNS/Bonjour)
    return 'local-network';
  }

  /**
   * Create and host a new session
   */
  async createSession(
    songManifest: SongManifestEntry[],
    options: CreateSessionOptions = {}
  ): Promise<QRSessionPayload | BootstrapSessionPayload> {
    // Cleanup any existing session
    await this.leaveSession();

    const type = options.type ?? this.detectBestTransport();
    const expiresInMs = options.expiresInMs ?? this.defaultExpiryMs;

    // Create session record
    const session = createSession(this.user.id, type, {
      libraryScope: options.libraryScope ?? 'full',
      selectedSongIds: options.selectedSongIds,
      expiresInMs,
    });

    // Create session document for real-time coordination
    this.sessionDoc = new Y.Doc({ guid: `session-${session.id}` });

    // Initialize bootstrap host if enabled
    if (options.enableBootstrap && options.songDocs) {
      await this.initBootstrapHost(options.appBundle, options.songDocs, session.id);
    }

    // Initialize session based on transport type
    switch (type) {
      case 'webrtc':
        await this.initWebRTCHost(session, options.password);
        break;
      case 'bluetooth':
        await this.initBluetoothHost(session);
        break;
      case 'local-network':
        await this.initLocalNetworkHost(session);
        break;
    }

    this.activeSession = session;

    // Generate QR payload
    let qrPayload: QRSessionPayload | BootstrapSessionPayload;

    if (options.enableBootstrap && this.bootstrapHost) {
      const bootstrapInfo = this.bootstrapHost.getBootstrapInfo();
      qrPayload = {
        sessionId: session.id,
        type: session.type,
        hostId: this.user.id,
        hostName: this.user.displayName,
        connectionInfo: session.connectionInfo,
        libraryManifest: songManifest,
        createdAt: session.createdAt.getTime(),
        expiresAt: session.expiresAt?.getTime(),
        bootstrapVersion: 1,
        bundleHash: bootstrapInfo.bundleHash,
        bundleSize: bootstrapInfo.bundleSize,
        songDataSize: bootstrapInfo.songDataSize,
      } satisfies BootstrapSessionPayload;
    } else {
      qrPayload = {
        sessionId: session.id,
        type: session.type,
        hostId: this.user.id,
        hostName: this.user.displayName,
        connectionInfo: session.connectionInfo,
        libraryManifest: songManifest,
        createdAt: session.createdAt.getTime(),
        expiresAt: session.expiresAt?.getTime(),
      };
    }

    this.emit('session-created', [{ session, qrPayload }]);

    return qrPayload;
  }

  /**
   * Initialize bootstrap host for serving app bundle and song data
   */
  private async initBootstrapHost(
    appBundle: ArrayBuffer | undefined,
    songDocs: Map<string, Y.Doc>,
    sessionId: string
  ): Promise<void> {
    this.bootstrapHost = new BootstrapHost({
      appBundle,
      songDocs,
      onBootstrapRequest: (peerId) => {
        this.emit('bootstrap-request', [{ peerId }]);
      },
      onTransferProgress: (peerId, type, progress) => {
        this.emit('bootstrap-progress', [{ peerId, type, progress }]);
      },
      onTransferComplete: (peerId, type, success) => {
        this.emit('bootstrap-complete', [{ peerId, type, success }]);
      },
    });

    if (appBundle) {
      await this.bootstrapHost.setAppBundle(appBundle);
    }

    // Set up raw WebRTC signaling for bootstrap connections
    // This handles join pages that use raw SDP signaling (not y-webrtc)
    this.bootstrapSignaling = new BootstrapSignaling({
      sessionId,
      signalingServer: this.signalingServers[0],
      onDataChannel: (channel, peerId) => {
        console.log('[SessionManager] Bootstrap data channel connected from:', peerId);
        if (this.bootstrapHost) {
          this.bootstrapHost.handleDataChannel(channel, peerId);
        }
      },
      onError: (err) => {
        console.error('[SessionManager] Bootstrap signaling error:', err);
        this.emit('error', [err]);
      },
    });

    await this.bootstrapSignaling.connect();
    console.log('[SessionManager] Bootstrap signaling ready');
  }

  /**
   * Update song documents for bootstrap serving
   */
  updateBootstrapSongs(songDocs: Map<string, Y.Doc>): void {
    if (this.bootstrapHost) {
      this.bootstrapHost.setSongDocs(songDocs);
    }
  }

  /**
   * Get the bootstrap host instance (for handling incoming data channels)
   */
  getBootstrapHost(): BootstrapHost | null {
    return this.bootstrapHost;
  }

  /**
   * Join an existing session using QR payload
   */
  async joinSession(options: JoinSessionOptions): Promise<void> {
    const { payload } = options;

    // Validate session
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      throw new Error('Session has expired');
    }

    // Cleanup any existing session
    await this.leaveSession();

    // Create local session record
    const session: Session = {
      id: payload.sessionId,
      hostId: payload.hostId,
      type: payload.type,
      connectionInfo: payload.connectionInfo,
      libraryScope: 'full', // Will be updated from host
      createdAt: new Date(payload.createdAt),
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
    };

    // Create session document
    this.sessionDoc = new Y.Doc({ guid: `session-${session.id}` });

    // Connect based on transport type
    switch (payload.type) {
      case 'webrtc':
        await this.connectWebRTC(session);
        break;
      case 'bluetooth':
        await this.connectBluetooth(session);
        break;
      case 'local-network':
        await this.connectLocalNetwork(session);
        break;
    }

    this.activeSession = session;

    this.emit('session-joined', [{ session, manifest: payload.libraryManifest }]);
  }

  /**
   * Leave the current session
   */
  async leaveSession(): Promise<void> {
    if (this.webrtcProvider) {
      this.webrtcProvider.destroy();
      this.webrtcProvider = null;
    }

    if (this.bluetoothProvider) {
      this.bluetoothProvider.destroy();
      this.bluetoothProvider = null;
    }

    if (this.bootstrapHost) {
      this.bootstrapHost.destroy();
      this.bootstrapHost = null;
    }

    if (this.bootstrapSignaling) {
      this.bootstrapSignaling.destroy();
      this.bootstrapSignaling = null;
    }

    if (this.sessionDoc) {
      this.sessionDoc.destroy();
      this.sessionDoc = null;
    }

    const wasActive = this.activeSession !== null;
    this.activeSession = null;

    if (wasActive) {
      this.emit('session-left', [{}]);
    }
  }

  /**
   * Get the Yjs document for the current session
   */
  getSessionDoc(): Y.Doc | null {
    return this.sessionDoc;
  }

  // ============================================================================
  // WebRTC Transport
  // ============================================================================

  private async initWebRTCHost(session: Session, password?: string): Promise<void> {
    if (!this.sessionDoc) throw new Error('Session doc not initialized');

    // Update connection info
    if (session.connectionInfo.type === 'webrtc') {
      session.connectionInfo.signalingServer = this.signalingServers[0];
      session.connectionInfo.password = password;
    }

    console.log('[SessionManager] Hosting WebRTC session:', {
      roomId: session.id,
      signalingServers: this.signalingServers,
      hasPassword: !!password,
    });

    this.webrtcProvider = new WebrtcProvider(session.id, this.sessionDoc, {
      signaling: this.signalingServers,
      password,
    });

    this.setupWebRTCListeners();
  }

  private async connectWebRTC(session: Session): Promise<void> {
    if (!this.sessionDoc) throw new Error('Session doc not initialized');

    const info = session.connectionInfo;
    if (info.type !== 'webrtc') throw new Error('Invalid connection info');

    console.log('[SessionManager] Joining WebRTC session:', {
      roomId: session.id,
      signalingServer: info.signalingServer,
      hasPassword: !!info.password,
    });

    this.webrtcProvider = new WebrtcProvider(session.id, this.sessionDoc, {
      signaling: [info.signalingServer],
      password: info.password,
    });

    this.setupWebRTCListeners();
  }

  private setupWebRTCListeners(): void {
    if (!this.webrtcProvider) return;

    // Initialize content sharing maps
    this.initContentSharing();

    const awareness = this.webrtcProvider.awareness;

    // Set local user info on awareness
    awareness.setLocalStateField('user', {
      displayName: this.user.displayName,
      avatarThumbnail: this.avatarThumbnail,
      instruments: this.user.instruments,
      isHost: this.isHosting,
      joinedAt: Date.now(),
    } as AwarenessParticipant);

    // Listen for awareness changes to track participants
    awareness.on('change', () => {
      const participants = this.getParticipants();
      this.emit('participants-changed', [{ participants }]);
    });

    this.webrtcProvider.on('synced', (event: { synced: boolean }) => {
      console.log('[SessionManager] WebRTC synced:', event.synced);
      this.emit('sync-status', [{ synced: event.synced, transport: 'webrtc' }]);
    });

    this.webrtcProvider.on('peers', (event: { webrtcPeers: unknown[] }) => {
      console.log('[SessionManager] WebRTC peers:', event.webrtcPeers.length);
      this.emit('peers-changed', [{ count: event.webrtcPeers.length, transport: 'webrtc' }]);
    });

    // Log connection status
    this.webrtcProvider.on('status', (event: { connected: boolean }) => {
      console.log('[SessionManager] WebRTC status:', event.connected ? 'connected' : 'disconnected');
    });
  }

  /**
   * Get list of all participants from awareness
   */
  getParticipants(): SessionParticipantInfo[] {
    if (!this.webrtcProvider) return [];

    const awareness = this.webrtcProvider.awareness;
    const states = awareness.getStates();
    const participants: SessionParticipantInfo[] = [];

    states.forEach((state: Record<string, unknown>, clientId: number) => {
      const user = state.user as AwarenessParticipant | undefined;
      if (user) {
        participants.push({
          clientId,
          displayName: user.displayName,
          avatarThumbnail: user.avatarThumbnail,
          instruments: user.instruments,
          isHost: user.isHost,
        });
      }
    });

    return participants;
  }

  // ============================================================================
  // Song Content Sharing
  // ============================================================================

  /**
   * Initialize song content sharing maps
   */
  private initContentSharing(): void {
    if (!this.sessionDoc) return;

    this.songContentMap = this.sessionDoc.getMap('songContent');
    this.contentRequests = this.sessionDoc.getMap('contentRequests');
    this.transposeStateMap = this.sessionDoc.getMap('transposeState');

    // Host: listen for content requests
    if (this.isHosting && this.contentProvider) {
      this.contentRequests.observe((event) => {
        event.changes.keys.forEach((change, songId) => {
          if (change.action === 'add' || change.action === 'update') {
            this.handleContentRequest(songId);
          }
        });
      });
    }
  }

  /**
   * Set the content provider function (host only)
   * Called with songId, should return the song content or null
   */
  setContentProvider(provider: (songId: string) => Promise<string | null>): void {
    this.contentProvider = provider;
  }

  /**
   * Handle a content request from a joiner (host only)
   */
  private async handleContentRequest(songId: string): Promise<void> {
    if (!this.contentProvider || !this.songContentMap) return;

    // Check if we already have this content
    if (this.songContentMap.has(songId)) {
      console.log('[SessionManager] Content already available for:', songId);
      return;
    }

    console.log('[SessionManager] Providing content for:', songId);
    try {
      const content = await this.contentProvider(songId);
      if (content) {
        this.songContentMap.set(songId, content);
        console.log('[SessionManager] Content provided for:', songId);
      }
    } catch (err) {
      console.error('[SessionManager] Failed to provide content for:', songId, err);
    }
  }

  /**
   * Request song content (joiner)
   * Returns immediately if content is cached, otherwise triggers a request
   */
  async requestSongContent(songId: string): Promise<string | null> {
    if (!this.songContentMap || !this.contentRequests) {
      return null;
    }

    // Check if content is already available
    const existing = this.songContentMap.get(songId);
    if (existing) {
      return existing;
    }

    // Request content from host
    console.log('[SessionManager] Requesting content for:', songId);
    this.contentRequests.set(songId, Date.now());

    // Wait for content to arrive (with timeout)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 10000); // 10 second timeout

      const observer = (event: Y.YMapEvent<string>) => {
        if (event.keysChanged.has(songId)) {
          cleanup();
          resolve(this.songContentMap?.get(songId) ?? null);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.songContentMap?.unobserve(observer);
      };

      if (this.songContentMap) {
        this.songContentMap.observe(observer);
      } else {
        cleanup();
        resolve(null);
      }
    });
  }

  /**
   * Get cached song content (sync, no request)
   */
  getCachedContent(songId: string): string | null {
    return this.songContentMap?.get(songId) ?? null;
  }

  /**
   * Check if content is available
   */
  hasContent(songId: string): boolean {
    return this.songContentMap?.has(songId) ?? false;
  }

  // ============================================================================
  // Transpose State Sharing
  // ============================================================================

  /**
   * Set transpose for a song (host only - syncs to all joiners)
   */
  setTranspose(songId: string, semitones: number): void {
    if (!this.transposeStateMap || !this.isHosting) return;
    this.transposeStateMap.set(songId, semitones);
    console.log('[SessionManager] Transpose set for', songId, ':', semitones);
  }

  /**
   * Get transpose for a song
   */
  getTranspose(songId: string): number {
    return this.transposeStateMap?.get(songId) ?? 0;
  }

  /**
   * Observe transpose changes for a song
   * Returns a cleanup function to stop observing
   */
  observeTranspose(songId: string, callback: (semitones: number) => void): () => void {
    if (!this.transposeStateMap) return () => {};

    const observer = (event: Y.YMapEvent<number>) => {
      if (event.keysChanged.has(songId)) {
        callback(this.transposeStateMap?.get(songId) ?? 0);
      }
    };

    this.transposeStateMap.observe(observer);
    return () => this.transposeStateMap?.unobserve(observer);
  }

  // ============================================================================
  // Bluetooth Transport
  // ============================================================================

  private async initBluetoothHost(session: Session): Promise<void> {
    if (!this.sessionDoc) throw new Error('Session doc not initialized');

    this.bluetoothProvider = new BluetoothProvider(this.sessionDoc, {
      sessionId: session.id,
      deviceName: `Gigwidget-${this.user.displayName}`,
    });

    // Update connection info
    if (session.connectionInfo.type === 'bluetooth') {
      session.connectionInfo.deviceName = `Gigwidget-${this.user.displayName}`;
      // UUIDs are set in the provider
    }

    this.setupBluetoothListeners();
  }

  private async connectBluetooth(session: Session): Promise<void> {
    if (!this.sessionDoc) throw new Error('Session doc not initialized');

    this.bluetoothProvider = new BluetoothProvider(this.sessionDoc, {
      sessionId: session.id,
    });

    // Scan and connect
    const device = await this.bluetoothProvider.scan();
    if (device) {
      await this.bluetoothProvider.connectToDevice(device);
    }

    this.setupBluetoothListeners();
  }

  private setupBluetoothListeners(): void {
    if (!this.bluetoothProvider) return;

    this.bluetoothProvider.on('peer-connected', () => {
      this.emit('peers-changed', [{ count: this.bluetoothProvider?.peerCount ?? 0, transport: 'bluetooth' }]);
    });

    this.bluetoothProvider.on('peer-disconnected', () => {
      this.emit('peers-changed', [{ count: this.bluetoothProvider?.peerCount ?? 0, transport: 'bluetooth' }]);
    });

    this.bluetoothProvider.on('error', (error: unknown) => {
      this.emit('error', [error]);
    });
  }

  // ============================================================================
  // Local Network Transport
  // ============================================================================

  private async initLocalNetworkHost(session: Session): Promise<void> {
    // Local network transport requires native platform support
    // This is a placeholder for Capacitor/Tauri implementations
    console.warn('Local network transport not yet implemented');

    if (session.connectionInfo.type === 'local-network') {
      session.connectionInfo.addresses = ['192.168.1.1']; // Placeholder
      session.connectionInfo.port = 8080;
      session.connectionInfo.token = generateId();
    }
  }

  private async connectLocalNetwork(_session: Session): Promise<void> {
    // Placeholder for native implementation
    console.warn('Local network transport not yet implemented');
  }

  /**
   * Handle incoming data channel for bootstrap
   * Call this when a new peer connects with a bootstrap data channel
   */
  handleBootstrapChannel(dataChannel: RTCDataChannel, peerId: string): void {
    if (this.bootstrapHost && dataChannel.label === BOOTSTRAP_CHANNEL_LABEL) {
      this.bootstrapHost.handleDataChannel(dataChannel, peerId);
    }
  }

  destroy(): void {
    this.leaveSession().catch(console.error);
    super.destroy();
  }
}
