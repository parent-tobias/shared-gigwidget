/**
 * Bootstrap Host for P2P App + Data Transfer
 *
 * Handles incoming bootstrap requests from joining devices,
 * sending app bundle and song data over WebRTC data channels.
 */

import * as Y from 'yjs';
import {
  BOOTSTRAP_CHANNEL_LABEL,
  CHUNK_SIZE,
  MAX_BUFFER_SIZE,
  type BootstrapControlMessage,
  type TransferStartMessage,
  type TransferEndMessage,
  type ErrorMessage,
  parseControlMessage,
  serializeControlMessage,
  generateTransferId,
} from './protocol.js';
import { chunkData, computeHash } from './chunker.js';
import { encodeSongStates, estimateEncodedSize } from './song-encoder.js';

// ============================================================================
// Types
// ============================================================================

export interface BootstrapHostOptions {
  /** Pre-loaded app bundle (Brotli compressed) */
  appBundle?: ArrayBuffer;
  /** Hash of the app bundle for verification */
  appBundleHash?: string;
  /** Song documents to share */
  songDocs: Map<string, Y.Doc>;
  /** Callback when a peer requests bootstrap */
  onBootstrapRequest?: (peerId: string) => void;
  /** Callback for transfer progress */
  onTransferProgress?: (peerId: string, type: 'app-bundle' | 'song-data', progress: number) => void;
  /** Callback when transfer completes */
  onTransferComplete?: (peerId: string, type: 'app-bundle' | 'song-data', success: boolean) => void;
}

interface PeerConnection {
  peerId: string;
  dataChannel: RTCDataChannel;
  activeTransfer?: {
    transferId: string;
    type: 'app-bundle' | 'song-data';
    chunks: ArrayBuffer[];
    currentChunk: number;
    paused: boolean;
  };
}

// ============================================================================
// Bootstrap Host
// ============================================================================

export class BootstrapHost {
  private appBundle?: ArrayBuffer;
  private appBundleHash?: string;
  private songDocs: Map<string, Y.Doc>;
  private peers: Map<string, PeerConnection> = new Map();
  private options: BootstrapHostOptions;

  constructor(options: BootstrapHostOptions) {
    this.options = options;
    this.appBundle = options.appBundle;
    this.appBundleHash = options.appBundleHash;
    this.songDocs = options.songDocs;
  }

  /**
   * Set the app bundle to serve to joining peers
   */
  async setAppBundle(bundle: ArrayBuffer): Promise<void> {
    this.appBundle = bundle;
    this.appBundleHash = await computeHash(bundle);
  }

  /**
   * Update the song documents to share
   */
  setSongDocs(docs: Map<string, Y.Doc>): void {
    this.songDocs = docs;
  }

  /**
   * Get bootstrap info for QR code payload
   */
  getBootstrapInfo(): {
    bundleHash?: string;
    bundleSize?: number;
    songDataSize: number;
  } {
    return {
      bundleHash: this.appBundleHash,
      bundleSize: this.appBundle?.byteLength,
      songDataSize: estimateEncodedSize(this.songDocs),
    };
  }

  /**
   * Handle a new data channel from a joining peer
   */
  handleDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    // Only handle bootstrap channels
    if (dataChannel.label !== BOOTSTRAP_CHANNEL_LABEL) {
      return;
    }

    const peer: PeerConnection = {
      peerId,
      dataChannel,
    };

    this.peers.set(peerId, peer);

    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onmessage = (event) => {
      this.handleMessage(peer, event.data);
    };

    dataChannel.onclose = () => {
      this.peers.delete(peerId);
    };

    dataChannel.onerror = (error) => {
      console.error(`Bootstrap channel error for peer ${peerId}:`, error);
      this.peers.delete(peerId);
    };

    // Handle backpressure
    dataChannel.onbufferedamountlow = () => {
      const transfer = peer.activeTransfer;
      if (transfer?.paused) {
        transfer.paused = false;
        this.resumeTransfer(peer);
      }
    };
  }

  /**
   * Handle incoming message from a peer
   */
  private handleMessage(peer: PeerConnection, data: string | ArrayBuffer): void {
    // Bootstrap protocol only receives JSON control messages from peers
    if (typeof data !== 'string') {
      console.warn('Unexpected binary message from bootstrap peer');
      return;
    }

    try {
      const message = parseControlMessage(data);
      this.handleControlMessage(peer, message);
    } catch (error) {
      console.error('Failed to parse bootstrap message:', error);
      this.sendError(peer, 'UNKNOWN', 'Failed to parse message');
    }
  }

  /**
   * Handle a control message from a peer
   */
  private handleControlMessage(peer: PeerConnection, message: BootstrapControlMessage): void {
    switch (message.type) {
      case 'request-bootstrap':
        this.handleRequestBootstrap(peer);
        break;

      case 'request-songs':
        this.handleRequestSongs(peer, message.songIds);
        break;

      default:
        console.warn('Unexpected message type from peer:', message.type);
    }
  }

  /**
   * Handle request for app bundle
   */
  private async handleRequestBootstrap(peer: PeerConnection): Promise<void> {
    this.options.onBootstrapRequest?.(peer.peerId);

    if (!this.appBundle || !this.appBundleHash) {
      this.sendError(peer, 'BUNDLE_NOT_AVAILABLE', 'App bundle not available');
      return;
    }

    await this.startTransfer(peer, 'app-bundle', this.appBundle, this.appBundleHash);
  }

  /**
   * Handle request for song data
   */
  private async handleRequestSongs(peer: PeerConnection, songIds?: string[]): Promise<void> {
    // Filter to requested songs if specified
    let docsToSend = this.songDocs;
    if (songIds && songIds.length > 0) {
      docsToSend = new Map();
      for (const id of songIds) {
        const doc = this.songDocs.get(id);
        if (doc) {
          docsToSend.set(id, doc);
        }
      }
    }

    if (docsToSend.size === 0) {
      // Send empty transfer
      const emptyData = new ArrayBuffer(4);
      new DataView(emptyData).setUint32(0, 0, true);
      const hash = await computeHash(emptyData);
      await this.startTransfer(peer, 'song-data', emptyData, hash);
      return;
    }

    const encodedData = encodeSongStates(docsToSend);
    const hash = await computeHash(encodedData);

    await this.startTransfer(peer, 'song-data', encodedData, hash);
  }

  /**
   * Start a transfer to a peer
   */
  private async startTransfer(
    peer: PeerConnection,
    type: 'app-bundle' | 'song-data',
    data: ArrayBuffer,
    hash: string
  ): Promise<void> {
    const transferId = generateTransferId();
    const chunks = chunkData(data, CHUNK_SIZE);

    peer.activeTransfer = {
      transferId,
      type,
      chunks,
      currentChunk: 0,
      paused: false,
    };

    // Send transfer-start message
    const startMessage: TransferStartMessage = {
      type: 'transfer-start',
      transferId,
      contentType: type,
      totalSize: data.byteLength,
      totalChunks: chunks.length,
      hash,
      compression: type === 'app-bundle' ? 'brotli' : 'none',
    };

    this.sendMessage(peer, startMessage);

    // Start sending chunks
    this.sendNextChunk(peer);
  }

  /**
   * Send the next chunk in a transfer
   */
  private sendNextChunk(peer: PeerConnection): void {
    const transfer = peer.activeTransfer;
    if (!transfer) return;

    const { dataChannel } = peer;

    // Check for backpressure
    if (dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
      transfer.paused = true;
      dataChannel.bufferedAmountLowThreshold = MAX_BUFFER_SIZE / 2;
      return;
    }

    while (transfer.currentChunk < transfer.chunks.length) {
      const chunk = transfer.chunks[transfer.currentChunk];

      // Send chunk as binary
      try {
        dataChannel.send(chunk);
      } catch (error) {
        console.error('Failed to send chunk:', error);
        this.sendError(peer, 'TRANSFER_FAILED', 'Failed to send chunk', transfer.transferId);
        peer.activeTransfer = undefined;
        return;
      }

      transfer.currentChunk++;

      // Report progress
      const progress = transfer.currentChunk / transfer.chunks.length;
      this.options.onTransferProgress?.(peer.peerId, transfer.type, progress);

      // Check buffer again
      if (dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
        transfer.paused = true;
        dataChannel.bufferedAmountLowThreshold = MAX_BUFFER_SIZE / 2;
        return;
      }
    }

    // Transfer complete
    const endMessage: TransferEndMessage = {
      type: 'transfer-end',
      transferId: transfer.transferId,
      success: true,
    };

    this.sendMessage(peer, endMessage);
    this.options.onTransferComplete?.(peer.peerId, transfer.type, true);
    peer.activeTransfer = undefined;
  }

  /**
   * Resume a paused transfer
   */
  private resumeTransfer(peer: PeerConnection): void {
    if (peer.activeTransfer && !peer.activeTransfer.paused) {
      this.sendNextChunk(peer);
    }
  }

  /**
   * Send a control message to a peer
   */
  private sendMessage(peer: PeerConnection, message: BootstrapControlMessage): void {
    try {
      peer.dataChannel.send(serializeControlMessage(message));
    } catch (error) {
      console.error('Failed to send control message:', error);
    }
  }

  /**
   * Send an error message to a peer
   */
  private sendError(
    peer: PeerConnection,
    code: ErrorMessage['code'],
    message: string,
    transferId?: string
  ): void {
    const errorMessage: ErrorMessage = {
      type: 'error',
      code,
      message,
      transferId,
    };
    this.sendMessage(peer, errorMessage);
  }

  /**
   * Cleanup and destroy the bootstrap host
   */
  destroy(): void {
    for (const peer of this.peers.values()) {
      try {
        peer.dataChannel.close();
      } catch {
        // Ignore close errors
      }
    }
    this.peers.clear();
  }
}
