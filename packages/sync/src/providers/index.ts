/**
 * Yjs Sync Providers for Gigwidget
 *
 * Provides multiple transport options for syncing Yjs documents:
 * - Supabase: Cloud sync through Supabase Realtime and Storage
 * - WebRTC: Peer-to-peer sync over WebRTC (via y-webrtc)
 * - Bluetooth: Offline P2P sync over Bluetooth LE
 */

// Base
export { Observable } from './observable.js';

// Providers
export { SupabaseProvider, type SupabaseProviderOptions } from './y-supabase.js';
export {
  BluetoothProvider,
  type BluetoothProviderOptions,
  type BluetoothPeer,
  isBluetoothAvailable,
} from './y-bluetooth.js';

// Re-export y-webrtc for convenience
export { WebrtcProvider } from 'y-webrtc';

// Re-export y-indexeddb for local persistence
export { IndexeddbPersistence } from 'y-indexeddb';
