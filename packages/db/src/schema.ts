/**
 * IndexedDB Schema for Gigwidget using Dexie
 *
 * This schema handles local persistence for:
 * - User data and preferences
 * - Song metadata and arrangements
 * - Snapshots for version history
 * - Spaces and memberships
 * - Sessions (ephemeral but cached for reconnection)
 * - Conflicts pending resolution
 *
 * Note: Yjs document state is stored via y-indexeddb provider,
 * not in this Dexie database.
 */

import Dexie, { type EntityTable } from 'dexie';
import type {
  User,
  UserPreferences,
  Song,
  Arrangement,
  Snapshot,
  Space,
  Membership,
  Session,
  SessionParticipant,
  SyncState,
  ConflictInfo,
  CustomInstrument,
  LocalFingering,
  SongMetadata,
  SongSet,
} from '@gigwidget/core';
import {
  createAnonymousUser,
  createSpace,
  generateId,
} from '@gigwidget/core';

// ============================================================================
// Database Class
// ============================================================================

export class GigwidgetDatabase extends Dexie {
  // Tables
  users!: EntityTable<User, 'id'>;
  userPreferences!: EntityTable<UserPreferences, 'userId'>;
  songs!: EntityTable<Song, 'id'>;
  arrangements!: EntityTable<Arrangement, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>;
  spaces!: EntityTable<Space, 'id'>;
  memberships!: EntityTable<Membership, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  sessionParticipants!: EntityTable<SessionParticipant, 'sessionId'>;
  syncStates!: EntityTable<SyncState, 'userId'>;
  conflicts!: EntityTable<ConflictInfo, 'id'>;

  // New tables (v2)
  customInstruments!: EntityTable<CustomInstrument, 'id'>;
  localFingerings!: EntityTable<LocalFingering, 'id'>;
  songMetadata!: EntityTable<SongMetadata, 'songId'>;
  songSets!: EntityTable<SongSet, 'id'>;

  constructor() {
    super('gigwidget');

    this.version(1).stores({
      // User tables
      users: 'id, supabaseId, createdAt',
      userPreferences: 'userId',

      // Song tables
      songs: 'id, ownerId, title, artist, visibility, updatedAt, *tags, *spaceIds',
      arrangements: 'id, songId, instrument, updatedAt',
      snapshots: 'id, songId, arrangementId, createdAt',

      // Space tables
      spaces: 'id, ownerId, type, name, createdAt',
      memberships: 'id, userId, spaceId, role',

      // Session tables (ephemeral but useful for reconnection)
      sessions: 'id, hostId, type, createdAt, expiresAt',
      sessionParticipants: '[sessionId+userId], sessionId, userId',

      // Sync tables
      syncStates: 'userId, syncStatus',
      conflicts: 'id, songId, arrangementId, resolved, detectedAt',
    });

    // Version 2: Add custom instruments, local fingerings, song metadata, and song sets
    this.version(2).stores({
      // Existing tables (unchanged)
      users: 'id, supabaseId, createdAt',
      userPreferences: 'userId',
      songs: 'id, ownerId, title, artist, visibility, updatedAt, *tags, *spaceIds',
      arrangements: 'id, songId, instrument, updatedAt',
      snapshots: 'id, songId, arrangementId, createdAt',
      spaces: 'id, ownerId, type, name, createdAt',
      memberships: 'id, userId, spaceId, role',
      sessions: 'id, hostId, type, createdAt, expiresAt',
      sessionParticipants: '[sessionId+userId], sessionId, userId',
      syncStates: 'userId, syncStatus',
      conflicts: 'id, songId, arrangementId, resolved, detectedAt',

      // New tables
      customInstruments: 'id, userId, name, baseType, isPublic',
      localFingerings: 'id, userId, chordName, instrumentId, [userId+chordName+instrumentId]',
      songMetadata: 'songId',
      songSets: 'id, userId, parentSetId, name, isSetlist',
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let dbInstance: GigwidgetDatabase | null = null;

export function getDatabase(): GigwidgetDatabase {
  if (!dbInstance) {
    dbInstance = new GigwidgetDatabase();
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Clear all data from the database (e.g., on logout).
 * This removes all tables and recreates them empty.
 */
export async function clearDatabase(): Promise<void> {
  const db = getDatabase();

  // Clear all tables in a transaction
  await db.transaction('rw', [
    db.users,
    db.userPreferences,
    db.songs,
    db.arrangements,
    db.snapshots,
    db.spaces,
    db.memberships,
    db.sessions,
    db.sessionParticipants,
    db.syncStates,
    db.conflicts,
    db.customInstruments,
    db.localFingerings,
    db.songMetadata,
    db.songSets,
  ], async () => {
    await db.users.clear();
    await db.userPreferences.clear();
    await db.songs.clear();
    await db.arrangements.clear();
    await db.snapshots.clear();
    await db.spaces.clear();
    await db.memberships.clear();
    await db.sessions.clear();
    await db.sessionParticipants.clear();
    await db.syncStates.clear();
    await db.conflicts.clear();
    await db.customInstruments.clear();
    await db.localFingerings.clear();
    await db.songMetadata.clear();
    await db.songSets.clear();
  });

  console.log('[DB] Database cleared');
}

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Initialize the database and create default user if needed.
 * Called on app startup.
 */
export async function initializeDatabase(): Promise<User> {
  const db = getDatabase();

  // Check for existing user
  const existingUsers = await db.users.toArray();

  if (existingUsers.length > 0) {
    // Return first (primary) user
    return existingUsers[0];
  }

  // Create anonymous user
  const user = createAnonymousUser();

  // Create default preferences
  const preferences: UserPreferences = {
    userId: user.id,
    autoSaveInterval: 5000, // 5 seconds
    snapshotRetention: 10, // Last 10 snapshots
  };

  // Create personal space
  const personalSpace = createSpace(user.id, 'My Library', 'personal', {
    description: 'Your personal song library',
  });

  // Create membership
  const membership: Membership = {
    id: generateId(),
    userId: user.id,
    spaceId: personalSpace.id,
    role: 'owner',
    joinedAt: new Date(),
  };

  // Create initial sync state
  const syncState: SyncState = {
    userId: user.id,
    lastLocalUpdate: new Date(),
    pendingChanges: 0,
    syncStatus: 'idle',
  };

  // Save all in transaction
  await db.transaction('rw', [db.users, db.userPreferences, db.spaces, db.memberships, db.syncStates], async () => {
    await db.users.add(user);
    await db.userPreferences.add(preferences);
    await db.spaces.add(personalSpace);
    await db.memberships.add(membership);
    await db.syncStates.add(syncState);
  });

  return user;
}
