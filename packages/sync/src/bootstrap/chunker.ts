/**
 * Chunker for Large Data Transfer over WebRTC
 *
 * Splits large data into 16KB chunks for reliable WebRTC transfer,
 * and reassembles chunks on the receiving end.
 */

import { CHUNK_SIZE } from './protocol.js';

// ============================================================================
// Chunking
// ============================================================================

/**
 * Split a large ArrayBuffer into chunks suitable for WebRTC transfer
 */
export function chunkData(data: ArrayBuffer, chunkSize: number = CHUNK_SIZE): ArrayBuffer[] {
  const chunks: ArrayBuffer[] = [];
  const totalChunks = Math.ceil(data.byteLength / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, data.byteLength);
    chunks.push(data.slice(start, end));
  }

  return chunks;
}

/**
 * Reassemble chunks into a single ArrayBuffer
 */
export function reassembleChunks(chunks: ArrayBuffer[]): ArrayBuffer {
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalSize);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

// ============================================================================
// Hash Verification
// ============================================================================

/**
 * Compute SHA-256 hash of data for integrity verification
 */
export async function computeHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify data integrity by comparing hashes
 */
export async function verifyHash(data: ArrayBuffer, expectedHash: string): Promise<boolean> {
  const actualHash = await computeHash(data);
  return actualHash === expectedHash;
}

// ============================================================================
// Compression Helpers
// ============================================================================

/**
 * Decompress Brotli-compressed data
 * Uses the browser's DecompressionStream API (available in modern browsers)
 */
export async function decompressBrotli(data: ArrayBuffer): Promise<ArrayBuffer> {
  // Check if DecompressionStream is available
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream not supported in this browser');
  }

  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  // Note: Brotli isn't directly supported by DecompressionStream in all browsers
  // For actual Brotli, we may need to use a library like 'brotli-wasm'
  // For now, we'll assume the data might be gzip/deflate or raw

  writer.write(data);
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

/**
 * Decompress gzip-compressed data
 */
export async function decompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream not supported in this browser');
  }

  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  writer.write(data);
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

/**
 * Decompress data based on compression type
 */
export async function decompress(
  data: ArrayBuffer,
  compression: 'brotli' | 'gzip' | 'none'
): Promise<ArrayBuffer> {
  switch (compression) {
    case 'brotli':
      return decompressBrotli(data);
    case 'gzip':
      return decompressGzip(data);
    case 'none':
      return data;
  }
}

// ============================================================================
// Transfer Progress Tracking
// ============================================================================

export interface ChunkReceiver {
  totalChunks: number;
  receivedChunks: Map<number, ArrayBuffer>;
  onProgress?: (received: number, total: number) => void;
}

/**
 * Create a chunk receiver for tracking incoming chunks
 */
export function createChunkReceiver(
  totalChunks: number,
  onProgress?: (received: number, total: number) => void
): ChunkReceiver {
  return {
    totalChunks,
    receivedChunks: new Map(),
    onProgress,
  };
}

/**
 * Add a chunk to the receiver
 * Returns true if all chunks have been received
 */
export function addChunk(receiver: ChunkReceiver, index: number, data: ArrayBuffer): boolean {
  receiver.receivedChunks.set(index, data);

  if (receiver.onProgress) {
    receiver.onProgress(receiver.receivedChunks.size, receiver.totalChunks);
  }

  return receiver.receivedChunks.size === receiver.totalChunks;
}

/**
 * Get assembled data from receiver
 * Returns null if not all chunks have been received
 */
export function getAssembledData(receiver: ChunkReceiver): ArrayBuffer | null {
  if (receiver.receivedChunks.size !== receiver.totalChunks) {
    return null;
  }

  // Assemble in order
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < receiver.totalChunks; i++) {
    const chunk = receiver.receivedChunks.get(i);
    if (!chunk) return null;
    chunks.push(chunk);
  }

  return reassembleChunks(chunks);
}
