/**
 * Core domain models for Gigwidget
 */

// ============================================================================
// Enums & Constants
// ============================================================================

export const INSTRUMENTS = [
  'guitar',
  'bass',
  'ukulele',
  'banjo',
  'mandolin',
  'drums',
  'keys',
  'vocals',
  'other',
] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

export const MUSICAL_KEYS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
  'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm',
  'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bbm', 'Bm',
] as const;

export type MusicalKey = (typeof MUSICAL_KEYS)[number];

export type Visibility = 'private' | 'space' | 'public';

export type SpaceType = 'personal' | 'group' | 'public';

export type MemberRole = 'owner' | 'editor' | 'viewer';

export type SessionType = 'webrtc' | 'bluetooth' | 'local-network';

// Subscription tiers for paywall
export const SUBSCRIPTION_TIERS = ['free', 'basic', 'pro', 'mod'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

// ============================================================================
// User Domain
// ============================================================================

export interface User {
  id: string;
  supabaseId?: string;
  displayName: string;
  avatar?: Blob;
  instruments: Instrument[];
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt?: Date;
  createdAt: Date;
  lastSyncAt?: Date;
}

export interface UserPreferences {
  userId: string;
  defaultInstrument?: Instrument;
  defaultTuning?: string;
  autoSaveInterval: number; // ms
  snapshotRetention: number; // count
}

// ============================================================================
// Song Domain
// ============================================================================

export interface Song {
  id: string;
  ownerId: string;
  title: string;
  artist?: string;
  key?: MusicalKey;
  tempo?: number;
  timeSignature?: [number, number];
  tags: string[];
  visibility: Visibility;
  spaceIds: string[];
  createdAt: Date;
  updatedAt: Date;
  yjsDocId: string;
}

export interface Arrangement {
  id: string;
  songId: string;
  instrument: Instrument;
  tuning?: string;
  capo?: number;
  content: string; // ChordPro format
  version: number;
  baseVersionHash?: string; // For conflict detection
  createdAt: Date;
  updatedAt: Date;
}

export interface Snapshot {
  id: string;
  songId: string;
  arrangementId: string;
  content: string;
  versionHash: string;
  createdAt: Date;
  note?: string;
}

// ============================================================================
// Space Domain
// ============================================================================

export interface Space {
  id: string;
  name: string;
  description?: string;
  type: SpaceType;
  ownerId: string;
  cloudEnabled: boolean;
  yjsDocId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Membership {
  id: string;
  userId: string;
  spaceId: string;
  role: MemberRole;
  joinedAt: Date;
}

// ============================================================================
// Session Domain (Ad-hoc P2P)
// ============================================================================

export interface Session {
  id: string;
  hostId: string;
  type: SessionType;
  connectionInfo: WebRTCConnectionInfo | BluetoothConnectionInfo | LocalNetworkConnectionInfo;
  libraryScope: 'full' | 'selected';
  selectedSongIds?: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface WebRTCConnectionInfo {
  type: 'webrtc';
  signalingServer: string;
  roomId: string;
  password?: string;
}

export interface BluetoothConnectionInfo {
  type: 'bluetooth';
  serviceUUID: string;
  characteristicUUID: string;
  deviceName: string;
}

export interface LocalNetworkConnectionInfo {
  type: 'local-network';
  addresses: string[];
  port: number;
  token: string;
}

export interface SessionParticipant {
  sessionId: string;
  userId: string;
  displayName: string;
  joinedAt: Date;
  syncStatus: 'syncing' | 'synced' | 'error';
}

// ============================================================================
// Sync Domain
// ============================================================================

export interface SyncState {
  userId: string;
  lastLocalUpdate: Date;
  lastCloudSync?: Date;
  pendingChanges: number;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline';
  errorMessage?: string;
}

export interface ConflictInfo {
  id: string;
  songId: string;
  arrangementId: string;
  localContent: string;
  remoteContent: string;
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
  remoteUserId: string;
  remoteUserName?: string;
  detectedAt: Date;
  resolved: boolean;
  resolution?: 'keep-local' | 'keep-remote' | 'keep-both';
}

// ============================================================================
// QR Code Domain
// ============================================================================

export interface QRSessionPayload {
  sessionId: string;
  type: SessionType;
  hostId: string;
  hostName: string;
  connectionInfo: WebRTCConnectionInfo | BluetoothConnectionInfo | LocalNetworkConnectionInfo;
  libraryManifest: SongManifestEntry[];
  createdAt: number;
  expiresAt?: number;
}

export interface SongManifestEntry {
  id: string;
  title: string;
  artist?: string;
  instruments: Instrument[];
}

// ============================================================================
// Bootstrap Domain (P2P App Transfer)
// ============================================================================

/**
 * Extended QR payload for bootstrap-enabled sessions.
 * Includes information needed for the bootstrap page to receive
 * the app bundle and song data from the host.
 */
export interface BootstrapSessionPayload extends QRSessionPayload {
  /** Bootstrap protocol version */
  bootstrapVersion: number;
  /** SHA-256 hash of the app bundle for integrity verification */
  bundleHash?: string;
  /** Size of the compressed app bundle in bytes */
  bundleSize?: number;
  /** Estimated size of song data in bytes */
  songDataSize?: number;
}

// ============================================================================
// Session Awareness Domain
// ============================================================================

/**
 * Participant info shared via Yjs awareness for real-time presence.
 * Kept small for efficient P2P transfer.
 */
export interface AwarenessParticipant {
  displayName: string;
  avatarThumbnail?: string; // Base64 encoded small thumbnail (< 5KB)
  instruments: Instrument[];
  isHost: boolean;
  joinedAt: number; // timestamp
}

/**
 * Session participant info with client ID for UI display.
 */
export interface SessionParticipantInfo {
  clientId: number;
  displayName: string;
  avatarThumbnail?: string;
  instruments: Instrument[];
  isHost: boolean;
}

// ============================================================================
// Custom Instrument Domain
// ============================================================================

/**
 * User-defined instrument with custom string tuning.
 * Allows users to define their own instruments (e.g., Drop-D Guitar, Tenor Ukulele).
 */
export interface CustomInstrument {
  id: string;
  userId: string;
  name: string; // e.g., "My Drop-D Guitar"
  baseType: Instrument; // Reference to base instrument type
  strings: string[]; // Tuning: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']
  frets: number; // Number of frets (default: 12)
  isPublic: boolean; // Shareable with others?
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Local Fingering Domain (NOT synced)
// ============================================================================

/**
 * Barre chord definition for fingering.
 */
export interface FingeringBarre {
  fret: number;
  fromString: number;
  toString: number;
}

/**
 * User's personal fingering override for a chord.
 * The chord NAME (e.g., "G7") syncs between devices, but the fingering does NOT.
 * Each user can have their own preferred way to play the same chord.
 */
export interface LocalFingering {
  id: string;
  userId: string;
  chordName: string; // "G7" - the chord NAME syncs, fingering doesn't
  instrumentId: string; // Custom or built-in instrument ID
  positions: number[]; // Fret positions per string (-1 = muted, 0 = open)
  fingers?: number[]; // Which finger on each string (1-4, 0 = none)
  barres?: FingeringBarre[];
  baseFret: number; // Starting fret position (default: 1)
  isDefault: boolean; // User's default for this chord/instrument combo
  createdAt: Date;
}

// ============================================================================
// Song Metadata Domain (NOT synced)
// ============================================================================

/**
 * Personal song metadata that stays local to the user.
 * Includes personal notes, play statistics, and preferences.
 */
export interface SongMetadata {
  songId: string;
  notes: string; // Personal notes about the song
  difficulty?: 1 | 2 | 3 | 4 | 5;
  lastPlayedAt?: Date;
  playCount: number;
}

// ============================================================================
// Song Set / Collection Domain
// ============================================================================

/**
 * Collection of songs for organization.
 * Can be a regular set (unordered) or a setlist (ordered for performance).
 */
export interface SongSet {
  id: string;
  userId: string;
  name: string;
  description?: string;
  parentSetId?: string; // For nested sets
  songIds: string[]; // Ordered list of song IDs
  isSetlist: boolean; // If true, order matters for performance
  createdAt: Date;
  updatedAt: Date;
}
