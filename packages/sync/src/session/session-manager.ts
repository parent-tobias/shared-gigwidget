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
  SongManifestEntry,
  User,
} from '@gigwidget/core';
import { createSession, generateId } from '@gigwidget/core';
import { WebrtcProvider } from 'y-webrtc';
import { BluetoothProvider, isBluetoothAvailable } from '../providers/index.js';
import { Observable } from '../providers/observable.js';

// Default WebRTC signaling servers
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
}

export interface JoinSessionOptions {
  payload: QRSessionPayload;
}

export class SessionManager extends Observable {
  private activeSession: Session | null = null;
  private sessionDoc: Y.Doc | null = null;
  private webrtcProvider: WebrtcProvider | null = null;
  private bluetoothProvider: BluetoothProvider | null = null;

  readonly user: User;
  private readonly signalingServers: string[];
  private readonly defaultExpiryMs: number;

  constructor(options: SessionManagerOptions) {
    super();
    this.user = options.user;
    this.signalingServers = options.signalingServers ?? DEFAULT_SIGNALING_SERVERS;
    this.defaultExpiryMs = options.defaultExpiryMs ?? 4 * 60 * 60 * 1000; // 4 hours
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
  ): Promise<QRSessionPayload> {
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
    const qrPayload: QRSessionPayload = {
      sessionId: session.id,
      type: session.type,
      hostId: this.user.id,
      hostName: this.user.displayName,
      connectionInfo: session.connectionInfo,
      libraryManifest: songManifest,
      createdAt: session.createdAt.getTime(),
      expiresAt: session.expiresAt?.getTime(),
    };

    this.emit('session-created', [{ session, qrPayload }]);

    return qrPayload;
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

    this.webrtcProvider = new WebrtcProvider(session.id, this.sessionDoc, {
      signaling: [info.signalingServer],
      password: info.password,
    });

    this.setupWebRTCListeners();
  }

  private setupWebRTCListeners(): void {
    if (!this.webrtcProvider) return;

    this.webrtcProvider.on('synced', (event: { synced: boolean }) => {
      this.emit('sync-status', [{ synced: event.synced, transport: 'webrtc' }]);
    });

    this.webrtcProvider.on('peers', (event: { webrtcPeers: unknown[] }) => {
      this.emit('peers-changed', [{ count: event.webrtcPeers.length, transport: 'webrtc' }]);
    });
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

  destroy(): void {
    this.leaveSession().catch(console.error);
    super.destroy();
  }
}
