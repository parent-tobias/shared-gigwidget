/**
 * Song Encoder for Bootstrap Transfer
 *
 * Encodes multiple Yjs document states into a single binary blob
 * for efficient P2P transfer during bootstrap.
 *
 * Binary format:
 * [count:u32][id1Len:u32][id1:bytes][state1Len:u32][state1:bytes]...
 */

import * as Y from 'yjs';

// ============================================================================
// Types
// ============================================================================

export interface EncodedSongData {
  id: string;
  state: Uint8Array;
}

// ============================================================================
// Encoding
// ============================================================================

/**
 * Encode multiple Yjs documents into a single binary blob
 */
export function encodeSongStates(songs: Map<string, Y.Doc>): ArrayBuffer {
  const entries: EncodedSongData[] = [];

  for (const [id, doc] of songs) {
    const state = Y.encodeStateAsUpdate(doc);
    entries.push({ id, state });
  }

  return encodeEntries(entries);
}

/**
 * Encode song entries to binary format
 */
export function encodeEntries(entries: EncodedSongData[]): ArrayBuffer {
  // Calculate total size
  let totalSize = 4; // count (u32)

  for (const entry of entries) {
    const idBytes = new TextEncoder().encode(entry.id);
    totalSize += 4; // id length (u32)
    totalSize += idBytes.byteLength; // id bytes
    totalSize += 4; // state length (u32)
    totalSize += entry.state.byteLength; // state bytes
  }

  // Allocate buffer
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;

  // Write count
  view.setUint32(offset, entries.length, true); // little-endian
  offset += 4;

  // Write each entry
  for (const entry of entries) {
    const idBytes = new TextEncoder().encode(entry.id);

    // Write id length
    view.setUint32(offset, idBytes.byteLength, true);
    offset += 4;

    // Write id bytes
    bytes.set(idBytes, offset);
    offset += idBytes.byteLength;

    // Write state length
    view.setUint32(offset, entry.state.byteLength, true);
    offset += 4;

    // Write state bytes
    bytes.set(entry.state, offset);
    offset += entry.state.byteLength;
  }

  return buffer;
}

// ============================================================================
// Decoding
// ============================================================================

/**
 * Decode binary blob back into song entries
 */
export function decodeSongStates(buffer: ArrayBuffer): EncodedSongData[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries: EncodedSongData[] = [];

  let offset = 0;

  // Read count
  const count = view.getUint32(offset, true);
  offset += 4;

  // Read each entry
  for (let i = 0; i < count; i++) {
    // Read id length
    const idLen = view.getUint32(offset, true);
    offset += 4;

    // Read id bytes
    const idBytes = bytes.slice(offset, offset + idLen);
    const id = new TextDecoder().decode(idBytes);
    offset += idLen;

    // Read state length
    const stateLen = view.getUint32(offset, true);
    offset += 4;

    // Read state bytes
    const state = new Uint8Array(bytes.slice(offset, offset + stateLen));
    offset += stateLen;

    entries.push({ id, state });
  }

  return entries;
}

/**
 * Apply decoded song states to Yjs documents
 * Creates new documents for each song and applies the state
 */
export function applySongStates(
  entries: EncodedSongData[],
  existingDocs?: Map<string, Y.Doc>
): Map<string, Y.Doc> {
  const docs = existingDocs ?? new Map<string, Y.Doc>();

  for (const entry of entries) {
    let doc = docs.get(entry.id);

    if (!doc) {
      doc = new Y.Doc({ guid: `song-${entry.id}` });
      docs.set(entry.id, doc);
    }

    Y.applyUpdate(doc, entry.state);
  }

  return docs;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate the size of encoded song data without actually encoding
 */
export function estimateEncodedSize(songs: Map<string, Y.Doc>): number {
  let size = 4; // count

  for (const [id, doc] of songs) {
    const idBytes = new TextEncoder().encode(id);
    const stateSize = Y.encodeStateAsUpdate(doc).byteLength;

    size += 4 + idBytes.byteLength + 4 + stateSize;
  }

  return size;
}

/**
 * Get song IDs from encoded data without fully decoding
 */
export function getSongIdsFromEncoded(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const ids: string[] = [];

  let offset = 0;

  // Read count
  const count = view.getUint32(offset, true);
  offset += 4;

  // Read each entry's ID only
  for (let i = 0; i < count; i++) {
    // Read id length
    const idLen = view.getUint32(offset, true);
    offset += 4;

    // Read id bytes
    const idBytes = bytes.slice(offset, offset + idLen);
    const id = new TextDecoder().decode(idBytes);
    ids.push(id);
    offset += idLen;

    // Skip state
    const stateLen = view.getUint32(offset, true);
    offset += 4 + stateLen;
  }

  return ids;
}
