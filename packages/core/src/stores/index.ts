/**
 * Yjs document store definitions for Gigwidget
 *
 * Architecture:
 * - Each Song has its own Y.Doc for fine-grained sync
 * - Library is a Y.Doc with references to songs (not full content)
 * - Spaces are Y.Docs shared among members
 */

import * as Y from 'yjs';

// ============================================================================
// Song Document
// ============================================================================

/**
 * Creates a Yjs document for a single song.
 * Each song is its own document to enable:
 * - Fine-grained sync (only sync songs that changed)
 * - Selective sharing (share individual songs)
 * - Collaborative editing of specific songs
 */
export function createSongDoc(songId: string): Y.Doc {
  const doc = new Y.Doc({ guid: `song-${songId}` });
  return doc;
}

/**
 * Type-safe accessors for song document structures
 */
export const SongDoc = {
  /** Song metadata (title, artist, key, etc.) */
  getMetadata(doc: Y.Doc): Y.Map<unknown> {
    return doc.getMap('metadata');
  },

  /** Array of arrangement references */
  getArrangements(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
    return doc.getArray('arrangements');
  },

  /** Map of arrangementId → Y.Text for content */
  getContents(doc: Y.Doc): Y.Map<Y.Text> {
    return doc.getMap('contents');
  },

  /** Get or create content text for an arrangement */
  getArrangementContent(doc: Y.Doc, arrangementId: string): Y.Text {
    const contents = this.getContents(doc);
    let content = contents.get(arrangementId);
    if (!content) {
      content = new Y.Text();
      contents.set(arrangementId, content);
    }
    return content;
  },

  /** Tags array */
  getTags(doc: Y.Doc): Y.Array<string> {
    return doc.getArray('tags');
  },
};

// ============================================================================
// Library Document
// ============================================================================

/**
 * Creates a library document for a user.
 * Contains lightweight references to songs, not full content.
 */
export function createLibraryDoc(userId: string): Y.Doc {
  const doc = new Y.Doc({ guid: `library-${userId}` });
  return doc;
}

/**
 * Type-safe accessors for library document structures
 */
export const LibraryDoc = {
  /** Map of songId → song metadata for listing */
  getSongs(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return doc.getMap('songs');
  },

  /** User's space memberships */
  getSpaces(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
    return doc.getArray('spaces');
  },

  /** Sync state tracking */
  getSyncState(doc: Y.Doc): Y.Map<unknown> {
    return doc.getMap('syncState');
  },
};

// ============================================================================
// Space Document
// ============================================================================

/**
 * Creates a space document for shared collections.
 * Synced among all members of the space.
 */
export function createSpaceDoc(spaceId: string): Y.Doc {
  const doc = new Y.Doc({ guid: `space-${spaceId}` });
  return doc;
}

/**
 * Type-safe accessors for space document structures
 */
export const SpaceDoc = {
  /** Space metadata (name, description, type) */
  getMetadata(doc: Y.Doc): Y.Map<unknown> {
    return doc.getMap('metadata');
  },

  /** Map of userId → member info with roles */
  getMembers(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return doc.getMap('members');
  },

  /** Array of song IDs shared in this space */
  getSongIds(doc: Y.Doc): Y.Array<string> {
    return doc.getArray('songIds');
  },

  /** Space settings */
  getSettings(doc: Y.Doc): Y.Map<unknown> {
    return doc.getMap('settings');
  },
};

// ============================================================================
// Session Document (Ephemeral)
// ============================================================================

/**
 * Creates a session document for ad-hoc P2P sessions.
 * These are ephemeral and not persisted to IndexedDB.
 */
export function createSessionDoc(sessionId: string): Y.Doc {
  const doc = new Y.Doc({ guid: `session-${sessionId}` });
  return doc;
}

/**
 * Type-safe accessors for session document structures
 */
export const SessionDoc = {
  /** Session metadata (host, type, settings) */
  getMetadata(doc: Y.Doc): Y.Map<unknown> {
    return doc.getMap('metadata');
  },

  /** Connected participants */
  getParticipants(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
    return doc.getMap('participants');
  },

  /** Shared song IDs for this session */
  getSharedSongIds(doc: Y.Doc): Y.Array<string> {
    return doc.getArray('sharedSongIds');
  },

  /** Real-time presence/awareness data */
  getPresence(doc: Y.Doc): Y.Map<unknown> {
    return doc.getMap('presence');
  },
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a content hash for conflict detection
 */
export function computeContentHash(content: string): string {
  // Simple hash for conflict detection
  // In production, use crypto.subtle.digest
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Encode a Y.Doc state for transmission/storage
 */
export function encodeDocState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Apply an encoded state to a Y.Doc
 */
export function applyDocState(doc: Y.Doc, state: Uint8Array, origin?: unknown): void {
  Y.applyUpdate(doc, state, origin);
}

/**
 * Merge two Y.Doc states
 */
export function mergeDocStates(state1: Uint8Array, state2: Uint8Array): Uint8Array {
  return Y.mergeUpdates([state1, state2]);
}
