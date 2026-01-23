/**
 * Bootstrap Protocol for P2P App + Data Transfer
 *
 * Defines message types for data channel communication during the
 * bootstrap process when a new device joins via QR code.
 */

// ============================================================================
// Control Messages (JSON)
// ============================================================================

export type BootstrapMessageType =
  | 'request-bootstrap'
  | 'transfer-start'
  | 'transfer-progress'
  | 'transfer-end'
  | 'request-songs'
  | 'error';

export interface RequestBootstrapMessage {
  type: 'request-bootstrap';
  version: string; // Client's expected version (or 'latest')
}

export interface TransferStartMessage {
  type: 'transfer-start';
  transferId: string;
  contentType: 'app-bundle' | 'song-data';
  totalSize: number;
  totalChunks: number;
  hash: string; // SHA-256 for integrity verification
  compression: 'brotli' | 'gzip' | 'none';
}

export interface TransferProgressMessage {
  type: 'transfer-progress';
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface TransferEndMessage {
  type: 'transfer-end';
  transferId: string;
  success: boolean;
}

export interface RequestSongsMessage {
  type: 'request-songs';
  songIds?: string[]; // Optional: specific songs, otherwise all session songs
}

export interface ErrorMessage {
  type: 'error';
  code: BootstrapErrorCode;
  message: string;
  transferId?: string;
}

export type BootstrapControlMessage =
  | RequestBootstrapMessage
  | TransferStartMessage
  | TransferProgressMessage
  | TransferEndMessage
  | RequestSongsMessage
  | ErrorMessage;

// ============================================================================
// Error Codes
// ============================================================================

export type BootstrapErrorCode =
  | 'BUNDLE_NOT_AVAILABLE'
  | 'TRANSFER_FAILED'
  | 'HASH_MISMATCH'
  | 'VERSION_MISMATCH'
  | 'SESSION_EXPIRED'
  | 'BACKPRESSURE'
  | 'UNKNOWN';

// ============================================================================
// Transfer State
// ============================================================================

export interface TransferState {
  transferId: string;
  contentType: 'app-bundle' | 'song-data';
  totalSize: number;
  totalChunks: number;
  receivedChunks: number;
  hash: string;
  compression: 'brotli' | 'gzip' | 'none';
  chunks: ArrayBuffer[];
  startedAt: number;
}

// ============================================================================
// Constants
// ============================================================================

/** 16KB chunk size - safe for all WebRTC implementations */
export const CHUNK_SIZE = 16 * 1024;

/** Data channel label for bootstrap communication */
export const BOOTSTRAP_CHANNEL_LABEL = 'gigwidget-bootstrap';

/** Maximum buffer size before applying backpressure (256KB) */
export const MAX_BUFFER_SIZE = 256 * 1024;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a message is a control message (JSON) vs binary chunk
 */
export function isControlMessage(data: unknown): data is BootstrapControlMessage {
  return typeof data === 'object' && data !== null && 'type' in data;
}

/**
 * Parse a control message from string
 */
export function parseControlMessage(data: string): BootstrapControlMessage {
  return JSON.parse(data) as BootstrapControlMessage;
}

/**
 * Serialize a control message to string
 */
export function serializeControlMessage(message: BootstrapControlMessage): string {
  return JSON.stringify(message);
}

/**
 * Generate a unique transfer ID
 */
export function generateTransferId(): string {
  return `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
