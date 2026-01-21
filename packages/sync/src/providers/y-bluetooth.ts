/**
 * Web Bluetooth Provider for Yjs
 *
 * Enables peer-to-peer sync of Yjs documents over Bluetooth Low Energy.
 * This is a fallback for when no network is available.
 *
 * Architecture:
 * - Host device acts as GATT server (peripheral)
 * - Joining devices act as GATT clients (central)
 * - Updates are chunked to fit BLE MTU limits
 *
 * Note: Web Bluetooth has limited browser support (Chrome, Edge, Opera).
 * This provider gracefully degrades when unavailable.
 */

import * as Y from 'yjs';
import { Observable } from './observable.js';

// BLE Service UUIDs
const GIGWIDGET_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const SYNC_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef1';
// Reserved for future use: awareness/presence data
// const AWARENESS_CHARACTERISTIC_UUID = '12345678-1234-5678-1234-56789abcdef2';

// BLE limits
const MAX_CHUNK_SIZE = 512; // Typical BLE MTU

export interface BluetoothProviderOptions {
  /** Device name to advertise (host mode) */
  deviceName?: string;
  /** Session ID for filtering devices */
  sessionId: string;
}

export interface BluetoothPeer {
  id: string;
  name: string;
  device: BluetoothDevice;
  characteristic?: BluetoothRemoteGATTCharacteristic;
}

/**
 * Check if Web Bluetooth is available
 */
export function isBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export class BluetoothProvider extends Observable {
  readonly doc: Y.Doc;
  readonly sessionId: string;
  readonly deviceName: string;

  private peers: Map<string, BluetoothPeer> = new Map();
  private _connected = false;
  private pendingChunks: Map<string, Uint8Array[]> = new Map();

  constructor(doc: Y.Doc, options: BluetoothProviderOptions) {
    super();
    this.doc = doc;
    this.sessionId = options.sessionId;
    this.deviceName = options.deviceName ?? `Gigwidget-${options.sessionId.slice(0, 8)}`;

    // Bind methods
    this.onDocUpdate = this.onDocUpdate.bind(this);
  }

  get connected(): boolean {
    return this._connected;
  }

  get peerCount(): number {
    return this.peers.size;
  }

  /**
   * Start scanning for nearby Gigwidget devices
   */
  async scan(): Promise<BluetoothDevice | null> {
    if (!isBluetoothAvailable()) {
      this.emit('error', [new Error('Web Bluetooth is not available')]);
      return null;
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [GIGWIDGET_SERVICE_UUID] },
          { namePrefix: 'Gigwidget-' },
        ],
        optionalServices: [GIGWIDGET_SERVICE_UUID],
      });

      return device;
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        this.emit('error', [error]);
      }
      return null;
    }
  }

  /**
   * Connect to a discovered device as a client
   */
  async connectToDevice(device: BluetoothDevice): Promise<void> {
    try {
      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }

      const service = await server.getPrimaryService(GIGWIDGET_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(SYNC_CHARACTERISTIC_UUID);

      // Set up notifications for incoming updates
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
        if (value) {
          this.handleIncomingData(device.id, new Uint8Array(value.buffer));
        }
      });

      // Register peer
      const peer: BluetoothPeer = {
        id: device.id,
        name: device.name ?? 'Unknown',
        device,
        characteristic,
      };
      this.peers.set(device.id, peer);

      // Subscribe to document updates
      if (!this._connected) {
        this.doc.on('update', this.onDocUpdate);
        this._connected = true;
      }

      // Request initial state
      await this.requestFullState(peer);

      this.emit('peer-connected', [{ peer }]);
    } catch (error) {
      this.emit('error', [error]);
    }
  }

  /**
   * Disconnect from all peers
   */
  disconnect(): void {
    this.doc.off('update', this.onDocUpdate);

    for (const peer of this.peers.values()) {
      peer.device.gatt?.disconnect();
    }

    this.peers.clear();
    this._connected = false;

    this.emit('disconnected', [{}]);
  }

  /**
   * Handle local document updates - send to all connected peers
   */
  private onDocUpdate(update: Uint8Array, origin: unknown): void {
    // Don't echo updates from BLE peers
    if (origin === this) return;

    this.broadcastUpdate(update);
  }

  /**
   * Broadcast an update to all connected peers
   */
  private async broadcastUpdate(update: Uint8Array): Promise<void> {
    const chunks = this.chunkData(update);

    for (const peer of this.peers.values()) {
      if (peer.characteristic) {
        try {
          for (const chunk of chunks) {
            await peer.characteristic.writeValue(new Uint8Array(chunk));
          }
        } catch (error) {
          console.error(`Failed to send update to peer ${peer.id}:`, error);
          // Peer may have disconnected
          this.handlePeerDisconnect(peer.id);
        }
      }
    }
  }

  /**
   * Handle incoming data from a peer
   */
  private handleIncomingData(peerId: string, data: Uint8Array): void {
    // Check if this is a chunked message
    const header = data[0];
    const isChunked = (header & 0x80) !== 0;
    const isLastChunk = (header & 0x40) !== 0;
    const payload = data.slice(1);

    if (isChunked) {
      // Accumulate chunks
      let chunks = this.pendingChunks.get(peerId);
      if (!chunks) {
        chunks = [];
        this.pendingChunks.set(peerId, chunks);
      }
      chunks.push(payload);

      if (isLastChunk) {
        // Combine chunks and apply
        const fullData = this.combineChunks(chunks);
        this.pendingChunks.delete(peerId);
        this.applyUpdate(fullData);
      }
    } else {
      // Single-chunk message
      this.applyUpdate(payload);
    }
  }

  /**
   * Apply a Yjs update from a peer
   */
  private applyUpdate(data: Uint8Array): void {
    try {
      Y.applyUpdate(this.doc, data, this);
    } catch (error) {
      console.error('Failed to apply Yjs update:', error);
    }
  }

  /**
   * Request full state from a peer (for initial sync)
   */
  private async requestFullState(peer: BluetoothPeer): Promise<void> {
    // Send state vector request
    const stateVector = Y.encodeStateVector(this.doc);
    const request = new Uint8Array([0x01, ...stateVector]); // 0x01 = state request

    try {
      await peer.characteristic?.writeValue(request);
    } catch (error) {
      console.error('Failed to request state:', error);
    }
  }

  /**
   * Handle peer disconnection
   */
  private handlePeerDisconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      this.peers.delete(peerId);
      this.pendingChunks.delete(peerId);
      this.emit('peer-disconnected', [{ peer }]);

      if (this.peers.size === 0) {
        this._connected = false;
        this.doc.off('update', this.onDocUpdate);
      }
    }
  }

  /**
   * Split data into BLE-sized chunks
   */
  private chunkData(data: Uint8Array): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    const maxPayloadSize = MAX_CHUNK_SIZE - 1; // Reserve 1 byte for header

    for (let offset = 0; offset < data.length; offset += maxPayloadSize) {
      const isLastChunk = offset + maxPayloadSize >= data.length;
      const chunkPayload = data.slice(offset, offset + maxPayloadSize);

      // Header: bit 7 = chunked, bit 6 = last chunk
      const header = 0x80 | (isLastChunk ? 0x40 : 0x00);
      const chunk = new Uint8Array([header, ...chunkPayload]);
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Combine chunked data
   */
  private combineChunks(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined;
  }

  destroy(): void {
    this.disconnect();
    super.destroy();
  }
}
