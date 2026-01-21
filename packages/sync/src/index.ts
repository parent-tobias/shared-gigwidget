/**
 * @gigwidget/sync
 *
 * CRDT sync providers and session management for the Gigwidget app.
 *
 * Provides:
 * - Supabase cloud sync provider
 * - WebRTC peer-to-peer sync (via y-webrtc)
 * - Bluetooth peer-to-peer sync for offline scenarios
 * - Session management for ad-hoc sharing sessions
 * - QR code generation for easy session joining
 */

// Providers
export * from './providers/index.js';

// Session management
export * from './session/index.js';
