/**
 * Repository layer for database operations
 *
 * Provides typed, reusable data access patterns for all domain entities.
 */

import type {
  Song,
  Arrangement,
  Snapshot,
  Space,
  Membership,
  Session,
  ConflictInfo,
  Visibility,
  Instrument,
  CustomInstrument,
  LocalFingering,
  SongMetadata,
  SongSet,
  SongChordOverride,
} from '@gigwidget/core';
import { getDatabase } from '../schema.js';

// ============================================================================
// Song Repository
// ============================================================================

export const SongRepository = {
  async getById(id: string): Promise<Song | undefined> {
    return getDatabase().songs.get(id);
  },

  async getByOwner(ownerId: string): Promise<Song[]> {
    return getDatabase().songs.where({ ownerId }).toArray();
  },

  async getBySpace(spaceId: string): Promise<Song[]> {
    return getDatabase().songs.filter((s) => s.spaceIds.includes(spaceId)).toArray();
  },

  async getByVisibility(visibility: Visibility): Promise<Song[]> {
    return getDatabase().songs.where({ visibility }).toArray();
  },

  async search(query: string): Promise<Song[]> {
    const lowerQuery = query.toLowerCase();
    return getDatabase().songs
      .filter(
        (song: Song) =>
          song.title.toLowerCase().includes(lowerQuery) ||
          song.artist?.toLowerCase().includes(lowerQuery) ||
          song.tags.some((tag: string) => tag.toLowerCase().includes(lowerQuery))
      )
      .toArray();
  },

  async create(song: Song): Promise<string> {
    return getDatabase().songs.add(song);
  },

  async update(id: string, updates: Partial<Song>): Promise<number> {
    return getDatabase().songs.update(id, { ...updates, updatedAt: new Date() });
  },

  async delete(id: string): Promise<void> {
    const db = getDatabase();
    await db.transaction('rw', [db.songs, db.arrangements, db.snapshots], async () => {
      await db.snapshots.where({ songId: id }).delete();
      await db.arrangements.where({ songId: id }).delete();
      await db.songs.delete(id);
    });
  },

  async addToSpace(songId: string, spaceId: string): Promise<void> {
    const song = await this.getById(songId);
    if (song && !song.spaceIds.includes(spaceId)) {
      await this.update(songId, { spaceIds: [...song.spaceIds, spaceId] });
    }
  },

  async removeFromSpace(songId: string, spaceId: string): Promise<void> {
    const song = await this.getById(songId);
    if (song) {
      await this.update(songId, {
        spaceIds: song.spaceIds.filter((id: string) => id !== spaceId),
      });
    }
  },
};

// ============================================================================
// Arrangement Repository
// ============================================================================

export const ArrangementRepository = {
  async getById(id: string): Promise<Arrangement | undefined> {
    return getDatabase().arrangements.get(id);
  },

  async getBySong(songId: string): Promise<Arrangement[]> {
    return getDatabase().arrangements.where({ songId }).toArray();
  },

  async getByInstrument(instrument: Instrument): Promise<Arrangement[]> {
    return getDatabase().arrangements.where({ instrument }).toArray();
  },

  async create(arrangement: Arrangement): Promise<string> {
    return getDatabase().arrangements.add(arrangement);
  },

  async update(id: string, updates: Partial<Arrangement>): Promise<number> {
    return getDatabase().arrangements.update(id, { ...updates, updatedAt: new Date() });
  },

  async delete(id: string): Promise<void> {
    const db = getDatabase();
    await db.transaction('rw', [db.arrangements, db.snapshots], async () => {
      await db.snapshots.where({ arrangementId: id }).delete();
      await db.arrangements.delete(id);
    });
  },
};

// ============================================================================
// Snapshot Repository
// ============================================================================

export const SnapshotRepository = {
  async getById(id: string): Promise<Snapshot | undefined> {
    return getDatabase().snapshots.get(id);
  },

  async getByArrangement(arrangementId: string): Promise<Snapshot[]> {
    return getDatabase().snapshots
      .where({ arrangementId })
      .reverse()
      .sortBy('createdAt');
  },

  async create(snapshot: Snapshot): Promise<string> {
    return getDatabase().snapshots.add(snapshot);
  },

  async delete(id: string): Promise<void> {
    await getDatabase().snapshots.delete(id);
  },

  async pruneForArrangement(arrangementId: string, maxCount: number = 10): Promise<void> {
    const snapshots = await this.getByArrangement(arrangementId);
    if (snapshots.length > maxCount) {
      const toDelete = snapshots.slice(maxCount);
      const db = getDatabase();
      await db.snapshots.bulkDelete(toDelete.map((s: Snapshot) => s.id));
    }
  },
};

// ============================================================================
// Space Repository
// ============================================================================

export const SpaceRepository = {
  async getById(id: string): Promise<Space | undefined> {
    return getDatabase().spaces.get(id);
  },

  async getByOwner(ownerId: string): Promise<Space[]> {
    return getDatabase().spaces.where({ ownerId }).toArray();
  },

  async getByMember(userId: string): Promise<Space[]> {
    const memberships = await getDatabase().memberships.where({ userId }).toArray();
    const spaceIds = memberships.map((m: Membership) => m.spaceId);
    if (spaceIds.length === 0) return [];
    return getDatabase().spaces.where('id').anyOf(spaceIds).toArray();
  },

  async create(space: Space): Promise<string> {
    return getDatabase().spaces.add(space);
  },

  async update(id: string, updates: Partial<Space>): Promise<number> {
    return getDatabase().spaces.update(id, { ...updates, updatedAt: new Date() });
  },

  async delete(id: string): Promise<void> {
    const db = getDatabase();
    await db.transaction('rw', [db.spaces, db.memberships], async () => {
      await db.memberships.where({ spaceId: id }).delete();
      await db.spaces.delete(id);
    });
  },
};

// ============================================================================
// Membership Repository
// ============================================================================

export const MembershipRepository = {
  async getByUser(userId: string): Promise<Membership[]> {
    return getDatabase().memberships.where({ userId }).toArray();
  },

  async getBySpace(spaceId: string): Promise<Membership[]> {
    return getDatabase().memberships.where({ spaceId }).toArray();
  },

  async get(userId: string, spaceId: string): Promise<Membership | undefined> {
    return getDatabase().memberships
      .where({ userId })
      .filter((m: Membership) => m.spaceId === spaceId)
      .first();
  },

  async create(membership: Membership): Promise<string> {
    return getDatabase().memberships.add(membership);
  },

  async updateRole(userId: string, spaceId: string, role: Membership['role']): Promise<void> {
    const membership = await this.get(userId, spaceId);
    if (membership) {
      await getDatabase().memberships.update(membership.id, { role });
    }
  },

  async delete(userId: string, spaceId: string): Promise<void> {
    const membership = await this.get(userId, spaceId);
    if (membership) {
      await getDatabase().memberships.delete(membership.id);
    }
  },
};

// ============================================================================
// Session Repository
// ============================================================================

export const SessionRepository = {
  async getById(id: string): Promise<Session | undefined> {
    return getDatabase().sessions.get(id);
  },

  async getByHost(hostId: string): Promise<Session[]> {
    return getDatabase().sessions.where({ hostId }).toArray();
  },

  async getActive(): Promise<Session[]> {
    const now = new Date();
    return getDatabase().sessions
      .filter((s: Session) => !s.expiresAt || s.expiresAt > now)
      .toArray();
  },

  async create(session: Session): Promise<string> {
    return getDatabase().sessions.add(session);
  },

  async delete(id: string): Promise<void> {
    const db = getDatabase();
    await db.transaction('rw', [db.sessions, db.sessionParticipants], async () => {
      await db.sessionParticipants.where({ sessionId: id }).delete();
      await db.sessions.delete(id);
    });
  },

  async cleanupExpired(): Promise<number> {
    const now = new Date();
    const expired = await getDatabase().sessions
      .filter((s: Session) => s.expiresAt !== undefined && s.expiresAt <= now)
      .toArray();

    for (const session of expired) {
      await this.delete(session.id);
    }

    return expired.length;
  },
};

// ============================================================================
// Conflict Repository
// ============================================================================

export const ConflictRepository = {
  async getById(id: string): Promise<ConflictInfo | undefined> {
    return getDatabase().conflicts.get(id);
  },

  async getPending(): Promise<ConflictInfo[]> {
    return getDatabase().conflicts.filter((c: ConflictInfo) => !c.resolved).toArray();
  },

  async getBySong(songId: string): Promise<ConflictInfo[]> {
    return getDatabase().conflicts.where({ songId }).toArray();
  },

  async create(conflict: ConflictInfo): Promise<string> {
    return getDatabase().conflicts.add(conflict);
  },

  async resolve(id: string, resolution: ConflictInfo['resolution']): Promise<void> {
    await getDatabase().conflicts.update(id, { resolved: true, resolution });
  },

  async delete(id: string): Promise<void> {
    await getDatabase().conflicts.delete(id);
  },

  async cleanupResolved(): Promise<number> {
    const resolved = await getDatabase().conflicts.filter((c: ConflictInfo) => c.resolved).toArray();
    await getDatabase().conflicts.bulkDelete(resolved.map((c: ConflictInfo) => c.id));
    return resolved.length;
  },
};

// ============================================================================
// Custom Instrument Repository
// ============================================================================

export const CustomInstrumentRepository = {
  async getById(id: string): Promise<CustomInstrument | undefined> {
    return getDatabase().customInstruments.get(id);
  },

  async getByUser(userId: string): Promise<CustomInstrument[]> {
    return getDatabase().customInstruments.where({ userId }).toArray();
  },

  async getPublic(): Promise<CustomInstrument[]> {
    return getDatabase().customInstruments.where({ isPublic: 1 }).toArray();
  },

  async getByBaseType(baseType: Instrument): Promise<CustomInstrument[]> {
    return getDatabase().customInstruments.where({ baseType }).toArray();
  },

  async create(instrument: CustomInstrument): Promise<string> {
    return getDatabase().customInstruments.add(instrument);
  },

  async update(id: string, updates: Partial<CustomInstrument>): Promise<number> {
    return getDatabase().customInstruments.update(id, { ...updates, updatedAt: new Date() });
  },

  async delete(id: string): Promise<void> {
    await getDatabase().customInstruments.delete(id);
  },
};

// ============================================================================
// Local Fingering Repository
// ============================================================================

export const LocalFingeringRepository = {
  async getById(id: string): Promise<LocalFingering | undefined> {
    return getDatabase().localFingerings.get(id);
  },

  async getByUser(userId: string): Promise<LocalFingering[]> {
    return getDatabase().localFingerings.where({ userId }).toArray();
  },

  async getByChord(userId: string, chordName: string): Promise<LocalFingering[]> {
    return getDatabase().localFingerings
      .where({ userId })
      .filter((f: LocalFingering) => f.chordName === chordName)
      .toArray();
  },

  async getByInstrument(userId: string, instrumentId: string): Promise<LocalFingering[]> {
    return getDatabase().localFingerings
      .where({ userId })
      .filter((f: LocalFingering) => f.instrumentId === instrumentId)
      .toArray();
  },

  async getByUserAndChord(userId: string, chordName: string, instrumentId: string): Promise<LocalFingering[]> {
    return getDatabase().localFingerings
      .where('[userId+chordName+instrumentId]')
      .equals([userId, chordName, instrumentId])
      .toArray();
  },

  async getDefault(userId: string, chordName: string, instrumentId: string): Promise<LocalFingering | undefined> {
    return getDatabase().localFingerings
      .where('[userId+chordName+instrumentId]')
      .equals([userId, chordName, instrumentId])
      .filter((f: LocalFingering) => f.isDefault)
      .first();
  },

  async create(fingering: LocalFingering): Promise<string> {
    return getDatabase().localFingerings.add(fingering);
  },

  async update(id: string, updates: Partial<LocalFingering>): Promise<number> {
    return getDatabase().localFingerings.update(id, updates);
  },

  async delete(id: string): Promise<void> {
    await getDatabase().localFingerings.delete(id);
  },

  async clearDefaults(userId: string, chordName: string, instrumentId: string): Promise<void> {
    const fingerings = await getDatabase().localFingerings
      .where('[userId+chordName+instrumentId]')
      .equals([userId, chordName, instrumentId])
      .toArray();

    for (const f of fingerings) {
      if (f.isDefault) {
        await getDatabase().localFingerings.update(f.id, { isDefault: false });
      }
    }
  },

  async setDefault(id: string, userId: string, chordName: string, instrumentId: string): Promise<void> {
    // Clear existing defaults first
    await this.clearDefaults(userId, chordName, instrumentId);
    // Set new default
    await getDatabase().localFingerings.update(id, { isDefault: true });
  },
};

// ============================================================================
// Song Metadata Repository
// ============================================================================

export const SongMetadataRepository = {
  async getBySong(songId: string): Promise<SongMetadata | undefined> {
    return getDatabase().songMetadata.get(songId);
  },

  async create(metadata: SongMetadata): Promise<string> {
    return getDatabase().songMetadata.add(metadata);
  },

  async update(songId: string, updates: Partial<SongMetadata>): Promise<number> {
    return getDatabase().songMetadata.update(songId, updates);
  },

  async upsert(metadata: SongMetadata): Promise<void> {
    await getDatabase().songMetadata.put(metadata);
  },

  async delete(songId: string): Promise<void> {
    await getDatabase().songMetadata.delete(songId);
  },

  async incrementPlayCount(songId: string): Promise<void> {
    const metadata = await this.getBySong(songId);
    if (metadata) {
      await this.update(songId, {
        playCount: metadata.playCount + 1,
        lastPlayedAt: new Date(),
      });
    } else {
      await this.create({
        songId,
        notes: '',
        playCount: 1,
        lastPlayedAt: new Date(),
      });
    }
  },
};

// ============================================================================
// Song Set Repository
// ============================================================================

export const SongSetRepository = {
  async getById(id: string): Promise<SongSet | undefined> {
    return getDatabase().songSets.get(id);
  },

  async getByUser(userId: string): Promise<SongSet[]> {
    return getDatabase().songSets.where({ userId }).toArray();
  },

  async getRootSets(userId: string): Promise<SongSet[]> {
    return getDatabase().songSets
      .where({ userId })
      .filter((s: SongSet) => !s.parentSetId)
      .toArray();
  },

  async getChildSets(parentSetId: string): Promise<SongSet[]> {
    return getDatabase().songSets.where({ parentSetId }).toArray();
  },

  async getSetlists(userId: string): Promise<SongSet[]> {
    return getDatabase().songSets
      .where({ userId })
      .filter((s: SongSet) => s.isSetlist)
      .toArray();
  },

  async create(set: SongSet): Promise<string> {
    return getDatabase().songSets.add(set);
  },

  async update(id: string, updates: Partial<SongSet>): Promise<number> {
    return getDatabase().songSets.update(id, { ...updates, updatedAt: new Date() });
  },

  async delete(id: string): Promise<void> {
    // Also delete any child sets
    const children = await this.getChildSets(id);
    for (const child of children) {
      await this.delete(child.id);
    }
    await getDatabase().songSets.delete(id);
  },

  async addSong(setId: string, songId: string): Promise<void> {
    const set = await this.getById(setId);
    if (set && !set.songIds.includes(songId)) {
      await this.update(setId, { songIds: [...set.songIds, songId] });
    }
  },

  async removeSong(setId: string, songId: string): Promise<void> {
    const set = await this.getById(setId);
    if (set) {
      await this.update(setId, {
        songIds: set.songIds.filter((id: string) => id !== songId),
      });
    }
  },

  async reorderSongs(setId: string, songIds: string[]): Promise<void> {
    await this.update(setId, { songIds });
  },

  async moveSong(setId: string, fromIndex: number, toIndex: number): Promise<void> {
    const set = await this.getById(setId);
    if (!set) return;

    const songIds = [...set.songIds];
    const [removed] = songIds.splice(fromIndex, 1);
    songIds.splice(toIndex, 0, removed);

    await this.update(setId, { songIds });
  },
};

// ============================================================================
// Song Chord Override Repository
// ============================================================================

export const SongChordOverrideRepository = {
  async getById(id: string): Promise<SongChordOverride | undefined> {
    return getDatabase().songChordOverrides.get(id);
  },

  async getBySong(userId: string, songId: string): Promise<SongChordOverride[]> {
    return getDatabase().songChordOverrides
      .where({ userId })
      .filter((o: SongChordOverride) => o.songId === songId)
      .toArray();
  },

  async getForChord(
    userId: string,
    songId: string,
    chordName: string
  ): Promise<SongChordOverride | undefined> {
    return getDatabase().songChordOverrides
      .where('[userId+songId+chordName]')
      .equals([userId, songId, chordName])
      .first();
  },

  async create(override: SongChordOverride): Promise<string> {
    return getDatabase().songChordOverrides.add(override);
  },

  async upsert(override: SongChordOverride): Promise<void> {
    const existing = await this.getForChord(
      override.userId,
      override.songId,
      override.chordName
    );

    if (existing) {
      await this.update(existing.id, {
        selectedSource: override.selectedSource,
        selectedVariationId: override.selectedVariationId,
        updatedAt: new Date(),
      });
    } else {
      await this.create(override);
    }
  },

  async update(id: string, updates: Partial<SongChordOverride>): Promise<number> {
    return getDatabase().songChordOverrides.update(id, {
      ...updates,
      updatedAt: new Date(),
    });
  },

  async delete(id: string): Promise<void> {
    await getDatabase().songChordOverrides.delete(id);
  },

  async clearForSong(userId: string, songId: string): Promise<void> {
    await getDatabase().songChordOverrides
      .where({ userId })
      .filter((o: SongChordOverride) => o.songId === songId)
      .delete();
  },
};
