/**
 * Domain services for Gigwidget
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Song,
  SongType,
  SavedSong,
  Arrangement,
  Snapshot,
  User,
  Space,
  Session,
  ConflictInfo,
  Instrument,
  Visibility,
  SessionType,
} from '../models/index.js';
import { computeContentHash } from '../stores/index.js';

// ============================================================================
// ID Generation
// ============================================================================

export function generateId(): string {
  return uuidv4();
}

export function generateLocalUserId(): string {
  return `local-${uuidv4()}`;
}

// ============================================================================
// User Service
// ============================================================================

export function createAnonymousUser(displayName?: string): User {
  return {
    id: generateLocalUserId(),
    displayName: displayName ?? `User ${Math.random().toString(36).substring(2, 6)}`,
    instruments: [],
    // Default to 'basic' for development; change to 'free' for production
    subscriptionTier: 'basic',
    createdAt: new Date(),
  };
}

export function upgradeToAuthenticatedUser(user: User, supabaseId: string): User {
  return {
    ...user,
    supabaseId,
    id: user.id, // Keep local ID for data continuity
  };
}

// ============================================================================
// Song Service
// ============================================================================

export function createSong(
  ownerId: string,
  title: string,
  options?: {
    artist?: string;
    key?: Song['key'];
    tempo?: number;
    timeSignature?: [number, number];
    tags?: string[];
    visibility?: Visibility;
    // Song lineage fields
    type?: SongType;
    sourceId?: string;
    forkedFromId?: string;
  }
): Song {
  const id = generateId();
  return {
    id,
    ownerId,
    title,
    artist: options?.artist,
    key: options?.key,
    tempo: options?.tempo,
    timeSignature: options?.timeSignature,
    tags: options?.tags ?? [],
    visibility: options?.visibility ?? 'private',
    spaceIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    yjsDocId: `song-${id}`,
    // Song lineage - default to 'original' if not specified
    type: options?.type ?? 'original',
    sourceId: options?.sourceId,
    forkedFromId: options?.forkedFromId,
  };
}

export function createArrangement(
  songId: string,
  instrument: Instrument,
  options?: {
    content?: string;
    tuning?: string;
    capo?: number;
  }
): Arrangement {
  const content = options?.content ?? '';
  return {
    id: generateId(),
    songId,
    instrument,
    tuning: options?.tuning,
    capo: options?.capo,
    content,
    version: 1,
    baseVersionHash: computeContentHash(content),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================================
// Song Lineage Service
// ============================================================================

/**
 * Interface for creating a saved song from a remote/public song.
 * The content is passed separately as it's not part of the Song model.
 */
export interface RemoteSongData {
  id: string;
  title: string;
  artist?: string;
  key?: Song['key'];
  tempo?: number;
  timeSignature?: [number, number];
  tags?: string[];
}

/**
 * Create a new saved song from a public/remote song.
 * Generates a NEW unique ID and sets type to 'saved' with sourceId pointing to the original.
 *
 * @param remoteSong - The original public song data
 * @param newOwnerId - The ID of the user saving the song
 * @returns A new Song object with type='saved'
 */
export function createSavedSong(
  remoteSong: RemoteSongData,
  newOwnerId: string
): Song {
  return createSong(newOwnerId, remoteSong.title, {
    artist: remoteSong.artist,
    key: remoteSong.key,
    tempo: remoteSong.tempo,
    timeSignature: remoteSong.timeSignature,
    tags: remoteSong.tags ? [...remoteSong.tags] : [],
    visibility: 'private', // Saved songs are always private initially
    type: 'saved',
    sourceId: remoteSong.id, // Reference to original public song
  });
}

/**
 * Create a SavedSong reference object for tracking the relationship
 * between a user's saved copy and the original public song.
 *
 * @param userId - User who saved the song
 * @param sourceId - Original public song ID
 * @param savedSongId - Local copy song ID
 * @returns A new SavedSong reference object
 */
export function createSavedSongReference(
  userId: string,
  sourceId: string,
  savedSongId: string
): SavedSong {
  return {
    id: generateId(),
    userId,
    sourceId,
    savedSongId,
    savedAt: new Date(),
  };
}

/**
 * Convert a saved song to a forked song.
 * Called when a user edits a saved song for the first time.
 * The song keeps its ID and sourceId, but type changes to 'forked'.
 *
 * @param song - The saved song to convert
 * @returns A new Song object with type='forked'
 * @throws Error if the song is not of type 'saved'
 */
export function convertSavedToForked(song: Song): Song {
  if (song.type !== 'saved') {
    throw new Error(`Cannot convert song of type '${song.type}' to forked. Only 'saved' songs can be forked.`);
  }

  return {
    ...song,
    type: 'forked',
    forkedFromId: song.id, // Self-reference marking the fork point
    updatedAt: new Date(),
  };
}

/**
 * Check if a song can be edited without forking.
 * Original songs can always be edited.
 * Forked songs can always be edited.
 * Saved songs require forking before editing.
 *
 * @param song - The song to check
 * @returns true if the song can be edited directly, false if it needs to be forked first
 */
export function canEditWithoutForking(song: Song): boolean {
  return song.type !== 'saved';
}

/**
 * Check if a song has a viewable original.
 * Saved and forked songs have a sourceId that can be used to view the original.
 *
 * @param song - The song to check
 * @returns true if the song has a sourceId
 */
export function hasViewableOriginal(song: Song): boolean {
  return song.sourceId !== undefined && song.sourceId !== null;
}

// ============================================================================
// Snapshot Service
// ============================================================================

const MAX_SNAPSHOTS_PER_ARRANGEMENT = 10;

export function createSnapshot(
  arrangement: Arrangement,
  note?: string
): Snapshot {
  return {
    id: generateId(),
    songId: arrangement.songId,
    arrangementId: arrangement.id,
    content: arrangement.content,
    versionHash: computeContentHash(arrangement.content),
    createdAt: new Date(),
    note,
  };
}

export function pruneSnapshots(snapshots: Snapshot[]): Snapshot[] {
  if (snapshots.length <= MAX_SNAPSHOTS_PER_ARRANGEMENT) {
    return snapshots;
  }
  // Keep the most recent snapshots
  return snapshots
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_SNAPSHOTS_PER_ARRANGEMENT);
}

// ============================================================================
// Conflict Detection
// ============================================================================

export function detectConflict(
  local: Arrangement,
  remote: { content: string; updatedAt: Date; userId: string; userName?: string }
): ConflictInfo | null {
  // If base versions match, no conflict
  const remoteHash = computeContentHash(remote.content);
  if (local.baseVersionHash === remoteHash) {
    return null;
  }

  // If local hasn't changed from base, just accept remote
  const localHash = computeContentHash(local.content);
  if (localHash === local.baseVersionHash) {
    return null;
  }

  // Both changed - conflict!
  return {
    id: generateId(),
    songId: local.songId,
    arrangementId: local.id,
    localContent: local.content,
    remoteContent: remote.content,
    localUpdatedAt: local.updatedAt,
    remoteUpdatedAt: remote.updatedAt,
    remoteUserId: remote.userId,
    remoteUserName: remote.userName,
    detectedAt: new Date(),
    resolved: false,
  };
}

export function resolveConflict(
  conflict: ConflictInfo,
  resolution: 'keep-local' | 'keep-remote' | 'keep-both'
): ConflictInfo {
  return {
    ...conflict,
    resolved: true,
    resolution,
  };
}

// ============================================================================
// Space Service
// ============================================================================

export function createSpace(
  ownerId: string,
  name: string,
  type: Space['type'],
  options?: {
    description?: string;
    cloudEnabled?: boolean;
  }
): Space {
  const id = generateId();
  return {
    id,
    name,
    description: options?.description,
    type,
    ownerId,
    cloudEnabled: options?.cloudEnabled ?? false,
    yjsDocId: `space-${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================================
// Session Service
// ============================================================================

export function createSession(
  hostId: string,
  type: SessionType,
  options?: {
    libraryScope?: 'full' | 'selected';
    selectedSongIds?: string[];
    expiresInMs?: number;
  }
): Session {
  const now = Date.now();
  const expiresAt = options?.expiresInMs
    ? new Date(now + options.expiresInMs)
    : undefined;

  const id = generateId();

  // Connection info will be set by the appropriate provider
  const connectionInfo = createConnectionInfoPlaceholder(type, id);

  return {
    id,
    hostId,
    type,
    connectionInfo,
    libraryScope: options?.libraryScope ?? 'full',
    selectedSongIds: options?.selectedSongIds,
    createdAt: new Date(now),
    expiresAt,
  };
}

function createConnectionInfoPlaceholder(type: SessionType, sessionId: string) {
  switch (type) {
    case 'webrtc':
      return {
        type: 'webrtc' as const,
        signalingServer: '', // Set by provider
        roomId: sessionId,
        password: undefined,
      };
    case 'bluetooth':
      return {
        type: 'bluetooth' as const,
        serviceUUID: '', // Set by provider
        characteristicUUID: '', // Set by provider
        deviceName: '', // Set by provider
      };
    case 'local-network':
      return {
        type: 'local-network' as const,
        addresses: [], // Set by provider
        port: 0, // Set by provider
        token: generateId(),
      };
  }
}

export function isSessionExpired(session: Session): boolean {
  if (!session.expiresAt) return false;
  return new Date() > session.expiresAt;
}

// ============================================================================
// Transpose Service
// ============================================================================

/**
 * Chromatic scale for transposition.
 * Uses sharps as canonical form, flats mapped during display.
 */
const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Map of enharmonic equivalents (flats to sharps)
 */
const ENHARMONIC_MAP: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Fb': 'E',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
  'Cb': 'B',
};

/**
 * Map of sharps to flats for display
 */
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
};

/**
 * Parse a chord name into root, quality, and bass note.
 * E.g., "Am7/G" → { root: "A", quality: "m7", bass: "G" }
 */
export function parseChord(chord: string): { root: string; quality: string; bass?: string } | null {
  // Match chord pattern: root note, optional quality, optional bass note
  const match = chord.match(/^([A-G][#b]?)([^/]*)?(?:\/([A-G][#b]?))?$/);
  if (!match) return null;

  return {
    root: match[1],
    quality: match[2] || '',
    bass: match[3],
  };
}

/**
 * Get the semitone index of a note (0-11)
 */
export function getNoteIndex(note: string): number {
  const normalized = ENHARMONIC_MAP[note] ?? note;
  const index = CHROMATIC_SCALE.indexOf(normalized as typeof CHROMATIC_SCALE[number]);
  return index >= 0 ? index : -1;
}

/**
 * Transpose a single note by N semitones.
 * @param note - The note to transpose (e.g., "C#", "Bb")
 * @param semitones - Number of semitones to transpose (positive = up, negative = down)
 * @param preferFlats - Whether to prefer flat notation
 */
export function transposeNote(note: string, semitones: number, preferFlats = false): string {
  const index = getNoteIndex(note);
  if (index < 0) return note;

  // Calculate new index with wrapping
  const newIndex = ((index + semitones) % 12 + 12) % 12;
  const result = CHROMATIC_SCALE[newIndex];

  // Convert to flat if preferred and available
  if (preferFlats && SHARP_TO_FLAT[result]) {
    return SHARP_TO_FLAT[result];
  }

  return result;
}

/**
 * Transpose a chord by N semitones.
 * @param chord - The chord to transpose (e.g., "Am7/G")
 * @param semitones - Number of semitones
 * @param preferFlats - Whether to prefer flat notation
 */
export function transposeChord(chord: string, semitones: number, preferFlats = false): string {
  const parsed = parseChord(chord);
  if (!parsed) return chord;

  const newRoot = transposeNote(parsed.root, semitones, preferFlats);
  const newBass = parsed.bass ? transposeNote(parsed.bass, semitones, preferFlats) : undefined;

  return newRoot + parsed.quality + (newBass ? `/${newBass}` : '');
}

/**
 * Calculate semitones between two keys.
 * @param fromKey - Starting key
 * @param toKey - Target key
 */
export function getSemitonesBetweenKeys(fromKey: string, toKey: string): number {
  // Extract root note (remove 'm' for minor keys)
  const fromRoot = fromKey.replace(/m$/, '');
  const toRoot = toKey.replace(/m$/, '');

  const fromIndex = getNoteIndex(fromRoot);
  const toIndex = getNoteIndex(toRoot);

  if (fromIndex < 0 || toIndex < 0) return 0;

  return ((toIndex - fromIndex) % 12 + 12) % 12;
}

/**
 * Transpose all chords in ChordPro content.
 * @param content - ChordPro formatted content
 * @param semitones - Number of semitones to transpose
 * @param preferFlats - Whether to prefer flat notation
 */
export function transposeChordProContent(
  content: string,
  semitones: number,
  preferFlats = false
): string {
  if (semitones === 0) return content;

  // Match chords in square brackets [Chord]
  return content.replace(/\[([^\]]+)\]/g, (_, chord) => {
    const transposed = transposeChord(chord, semitones, preferFlats);
    return `[${transposed}]`;
  });
}

/**
 * Get the display name for a transposition.
 * @param semitones - Number of semitones
 */
export function getTransposeDisplayName(semitones: number): string {
  if (semitones === 0) return 'Original';
  const direction = semitones > 0 ? '+' : '';
  return `${direction}${semitones} semitone${Math.abs(semitones) !== 1 ? 's' : ''}`;
}

// ============================================================================
// Scraper Service (re-export)
// ============================================================================

export {
  searchOzbcozSongs,
  getOzbcozSongDetail,
  convertToGigwidgetSong,
  type OzbcozSearchResult,
  type OzbcozSongDetail,
} from './scraper.js';

// ============================================================================
// Permissions Service (re-export)
// ============================================================================

export {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getUserPermissions,
  getEffectiveTier,
  getRequiredTierForPermission,
  canUpgrade,
  getNextTier,
  TIER_INFO,
  type Permission,
  type TierInfo,
} from './permissions.js';

// ============================================================================
// Chord Resolution Service (re-export)
// ============================================================================

export {
  chordResolutionService,
  ChordResolutionService,
  type ChordDataProvider,
  type ResolvedChord,
  type ChordResolutionOptions,
  type SongChordResolutionOptions,
} from './chordResolution.js';
