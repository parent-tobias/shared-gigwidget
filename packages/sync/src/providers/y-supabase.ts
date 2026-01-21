/**
 * Supabase Provider for Yjs
 *
 * Enables cloud sync of Yjs documents through Supabase Realtime and Storage.
 *
 * Strategy:
 * 1. Store full Yjs state vectors in Supabase Storage (blob)
 * 2. Use Realtime channels for incremental updates
 * 3. On reconnect, merge state vectors for eventual consistency
 */

import * as Y from 'yjs';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { Observable } from './observable.js';

export interface SupabaseProviderOptions {
  /** Supabase client instance */
  supabase: SupabaseClient;
  /** Room/document identifier */
  roomName: string;
  /** Storage bucket for state persistence */
  bucket?: string;
  /** Auto-save interval in ms (0 to disable) */
  autoSaveInterval?: number;
}

export class SupabaseProvider extends Observable {
  private channel: RealtimeChannel | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private _synced = false;

  readonly doc: Y.Doc;
  readonly roomName: string;

  private readonly supabase: SupabaseClient;
  private readonly bucket: string;
  private readonly autoSaveInterval: number;

  constructor(doc: Y.Doc, options: SupabaseProviderOptions) {
    super();
    this.doc = doc;
    this.supabase = options.supabase;
    this.roomName = options.roomName;
    this.bucket = options.bucket ?? 'yjs-states';
    this.autoSaveInterval = options.autoSaveInterval ?? 30000;

    // Bind methods
    this.onDocUpdate = this.onDocUpdate.bind(this);
    this.onBroadcast = this.onBroadcast.bind(this);
  }

  get synced(): boolean {
    return this._synced;
  }

  /**
   * Connect to Supabase and start syncing
   */
  async connect(): Promise<void> {
    // Load existing state from storage
    await this.loadSnapshot();

    // Subscribe to document updates
    this.doc.on('update', this.onDocUpdate);

    // Join realtime channel
    this.channel = this.supabase
      .channel(`yjs:${this.roomName}`)
      .on('broadcast', { event: 'yjs-update' }, this.onBroadcast)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this._synced = true;
          this.emit('synced', [{ synced: true }]);
        }
      });

    // Start auto-save timer
    if (this.autoSaveInterval > 0) {
      this.autoSaveTimer = setInterval(() => {
        this.saveSnapshot().catch(console.error);
      }, this.autoSaveInterval);
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // Stop auto-save
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Unsubscribe from doc updates
    this.doc.off('update', this.onDocUpdate);

    // Leave channel
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this._synced = false;
    this.emit('synced', [{ synced: false }]);
  }

  /**
   * Save current document state to Supabase Storage
   */
  async saveSnapshot(): Promise<void> {
    const state = Y.encodeStateAsUpdate(this.doc);
    const blob = new Blob([new Uint8Array(state)], { type: 'application/octet-stream' });

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(`${this.roomName}.yjs`, blob, {
        upsert: true,
        contentType: 'application/octet-stream',
      });

    if (error) {
      console.error('Failed to save Yjs snapshot:', error);
      this.emit('error', [error]);
    }
  }

  /**
   * Load document state from Supabase Storage
   */
  async loadSnapshot(): Promise<boolean> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .download(`${this.roomName}.yjs`);

    if (error) {
      // File not found is expected for new documents
      if (error.message.includes('not found')) {
        return false;
      }
      console.error('Failed to load Yjs snapshot:', error);
      this.emit('error', [error]);
      return false;
    }

    if (data) {
      const state = new Uint8Array(await data.arrayBuffer());
      Y.applyUpdate(this.doc, state, this);
      return true;
    }

    return false;
  }

  /**
   * Handle local document updates - broadcast to peers
   */
  private onDocUpdate(update: Uint8Array, origin: unknown): void {
    // Don't echo updates that came from this provider
    if (origin === this) return;

    // Broadcast to other connected clients
    this.channel?.send({
      type: 'broadcast',
      event: 'yjs-update',
      payload: {
        update: Array.from(update),
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Handle remote updates from Supabase Realtime
   */
  private onBroadcast({ payload }: { payload: { update: number[]; timestamp: number } }): void {
    const update = new Uint8Array(payload.update);
    Y.applyUpdate(this.doc, update, this);
  }

  /**
   * Force sync - save local state and reload remote state
   */
  async forceSync(): Promise<void> {
    await this.saveSnapshot();
    await this.loadSnapshot();
  }

  destroy(): void {
    this.disconnect().catch(console.error);
    super.destroy();
  }
}
