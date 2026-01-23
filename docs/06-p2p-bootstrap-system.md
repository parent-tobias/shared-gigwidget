# P2P Bootstrap System

The P2P Bootstrap System enables users without the app to scan a QR code and receive both the app AND song data directly from the host device via WebRTC, minimizing internet dependency.

## Overview

```
QR Code -> https://gigwidget.app/join#<session-data>
                |
    Bootstrap page loads (~12KB, cached by service worker)
                |
    Raw WebRTC connection to host (via signaling server)
                |
    Host sends app bundle (~1-2MB compressed) over data channel
                |
    Host sends song Yjs documents over data channel
                |
    Bootstrap injects app, hands off WebRTC connection
                |
    Full app runs, Yjs sync continues
```

## Internet Requirements

**Internet required only for:**
- Initial bootstrap page load (cached after first use)
- WebRTC signaling (~few KB to exchange connection info)

**Everything else is P2P:**
- App bundle transfer
- Song data transfer
- Ongoing Yjs sync

---

## Architecture

### Package Structure

```
packages/sync/src/bootstrap/
├── index.ts           # Module exports
├── protocol.ts        # Message types for data channel communication
├── chunker.ts         # Split/reassemble large data (16KB chunks)
├── song-encoder.ts    # Encode/decode Yjs doc states into binary blob
└── bootstrap-host.ts  # Host-side bootstrap serving

apps/web/
├── static/join/index.html       # Bootstrap page (~12KB)
├── src/service-worker.ts        # Caches bootstrap page
└── vite-plugin-bootstrap-bundle.ts  # Generates compressed bundle
```

### Data Flow

```
┌─────────────────┐         ┌─────────────────┐
│    HOST DEVICE  │         │  JOINING DEVICE │
│    (with app)   │         │  (no app yet)   │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │  1. Create Session        │
         │  2. Generate QR Code      │
         │                           │
         │         QR Scan           │
         │◀──────────────────────────│
         │                           │
         │  3. Load bootstrap page   │
         │     (from CDN/cache)      │
         │                           │
         │  4. WebRTC Signaling      │
         │◀─────────────────────────▶│
         │                           │
         │  5. Send app bundle       │
         │─────────────────────────▶ │
         │     (~1-2MB gzipped)      │
         │                           │
         │  6. Send song data        │
         │─────────────────────────▶ │
         │     (Yjs state vectors)   │
         │                           │
         │  7. App loads, sync       │
         │◀─────────────────────────▶│
         │     continues             │
         │                           │
```

---

## Protocol Specification

### Message Types

The bootstrap protocol uses JSON control messages and binary data chunks over a WebRTC data channel.

#### Control Messages

| Type | Direction | Purpose |
|------|-----------|---------|
| `request-bootstrap` | Joiner → Host | Request app bundle |
| `transfer-start` | Host → Joiner | Announce transfer start |
| `transfer-progress` | Host → Joiner | Progress update |
| `transfer-end` | Host → Joiner | Transfer complete |
| `request-songs` | Joiner → Host | Request song data |
| `error` | Bidirectional | Error notification |

#### Transfer Start Message

```typescript
interface TransferStartMessage {
  type: 'transfer-start';
  transferId: string;
  contentType: 'app-bundle' | 'song-data';
  totalSize: number;
  totalChunks: number;
  hash: string;          // SHA-256 for verification
  compression: 'brotli' | 'gzip' | 'none';
}
```

### Binary Chunk Format

Data is sent in 16KB chunks (safe for all WebRTC implementations):

```
[Binary ArrayBuffer - max 16384 bytes per chunk]
```

Chunks are sent sequentially after the `transfer-start` message.

### Song Data Encoding

Multiple Yjs documents are encoded into a single binary blob:

```
[count:u32]
  [id1Len:u32][id1:bytes][state1Len:u32][state1:bytes]
  [id2Len:u32][id2:bytes][state2Len:u32][state2:bytes]
  ...
```

---

## Bootstrap Session Payload

The QR code encodes a `BootstrapSessionPayload`:

```typescript
interface BootstrapSessionPayload extends QRSessionPayload {
  bootstrapVersion: number;  // Protocol version
  bundleHash?: string;       // SHA-256 of app bundle
  bundleSize?: number;       // Compressed bundle size
  songDataSize?: number;     // Estimated song data size
}
```

This allows the bootstrap page to show accurate progress and verify data integrity.

---

## Host Implementation

### Enabling Bootstrap Mode

```typescript
import { SessionManager } from '@gigwidget/sync';

const sessionManager = new SessionManager({ user });

// Create session with bootstrap enabled
const payload = await sessionManager.createSession(songManifest, {
  type: 'webrtc',
  enableBootstrap: true,
  appBundle: compressedAppBundle,  // Pre-loaded bundle
  songDocs: songDocuments,          // Map<string, Y.Doc>
});

// Generate QR code URL
import { generateBootstrapUrl } from '@gigwidget/sync';
const url = generateBootstrapUrl(payload);
// => https://gigwidget.app/join#<encoded-data>
```

### Handling Bootstrap Channels

The host automatically handles incoming bootstrap requests when `enableBootstrap` is true. Progress can be monitored via events:

```typescript
sessionManager.on('bootstrap-request', ({ peerId }) => {
  console.log(`Peer ${peerId} requested bootstrap`);
});

sessionManager.on('bootstrap-progress', ({ peerId, type, progress }) => {
  console.log(`${type}: ${Math.round(progress * 100)}%`);
});

sessionManager.on('bootstrap-complete', ({ peerId, type, success }) => {
  console.log(`${type} transfer ${success ? 'complete' : 'failed'}`);
});
```

---

## Bootstrap Page

The bootstrap page (`/join/index.html`) is a self-contained ~12KB HTML file with:

- Inline CSS for styling
- Inline JavaScript for WebRTC and transfer logic
- No external dependencies
- Progress UI with transfer status

### Features

1. **Session Parsing**: Decodes session data from URL hash
2. **WebRTC Connection**: Establishes peer connection via signaling
3. **Progress Display**: Shows download progress for bundle and songs
4. **Hash Verification**: Validates data integrity before loading
5. **App Injection**: Writes received app bundle into DOM
6. **Context Handoff**: Stores connection info in `window.__GIGWIDGET_BOOTSTRAP_CONTEXT__`

---

## App Integration

### Detecting Bootstrap Context

The app checks for bootstrap context on load:

```typescript
// In +layout.svelte
const bootstrapCtx = sessionStore.getBootstrapContext();
if (bootstrapCtx?.bootstrapComplete) {
  // Initialize in bootstrap mode
  await initializeWithBootstrap(bootstrapCtx);
}
```

### Bootstrap Context Interface

```typescript
interface BootstrapContext {
  appBundle?: ArrayBuffer;
  compression?: 'brotli' | 'gzip' | 'none';
  payload?: BootstrapSessionPayload;
  songData?: ArrayBuffer;
  dataChannel?: RTCDataChannel;
  peerConnection?: RTCPeerConnection;
  bootstrapComplete?: boolean;
}
```

### Joining with Existing Connection

```typescript
const sessionStore = getSessionStore();

// Use the existing WebRTC connection from bootstrap
await sessionStore.joinWithBootstrapContext(user, bootstrapCtx);
```

---

## Service Worker Caching

The service worker caches the bootstrap page for instant loading:

```typescript
// Cache strategy for /join routes
const BOOTSTRAP_ROUTES = ['/join', '/join/', '/join/index.html'];

// Cache-first strategy for instant loading
if (isBootstrapRoute(url.pathname)) {
  return cacheFirst(request, BOOTSTRAP_CACHE);
}
```

After the first visit, the bootstrap page loads instantly from cache.

---

## Build Configuration

### Bootstrap Bundle Plugin

The Vite plugin generates a single compressed bundle:

```typescript
// vite.config.ts
import { bootstrapBundle } from './vite-plugin-bootstrap-bundle';

export default defineConfig({
  plugins: [
    sveltekit(),
    bootstrapBundle({
      outputDir: '_app/immutable',
      outputName: 'bootstrap-bundle',
      generateManifest: true,
    }),
  ],
});
```

### Output Files

After build:
```
build/_app/immutable/
├── bootstrap-bundle.html    # Raw bundle (~3-5MB)
├── bootstrap-bundle.gz      # Gzip compressed (~1-2MB)
└── bootstrap-manifest.json  # Bundle metadata
```

---

## Error Handling

### Error Codes

| Code | Description |
|------|-------------|
| `BUNDLE_NOT_AVAILABLE` | Host doesn't have app bundle |
| `TRANSFER_FAILED` | Chunk send failed |
| `HASH_MISMATCH` | Data integrity check failed |
| `VERSION_MISMATCH` | Protocol version incompatible |
| `SESSION_EXPIRED` | Session no longer valid |
| `BACKPRESSURE` | Transfer paused due to buffer |

### Retry Behavior

The bootstrap page shows a "Try Again" button on error, allowing users to retry the connection.

---

## Security Considerations

1. **Data Integrity**: SHA-256 hash verification for all transfers
2. **Session Expiry**: Sessions have configurable expiration times
3. **No Sensitive Data**: Bootstrap only transfers app code and song content
4. **Signaling Only**: Internet is only used for WebRTC signaling handshake
5. **P2P Transfer**: Actual data never touches servers

---

## Performance Optimizations

1. **Chunking**: 16KB chunks for reliable WebRTC transfer
2. **Backpressure**: Automatic pause when buffer exceeds 256KB
3. **Compression**: Gzip compression reduces bundle size by ~70%
4. **Caching**: Service worker caches bootstrap page
5. **Parallel Transfer**: Bundle and song data streamed efficiently
