# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 9+

## Getting Started

### 1. Clone and Install

```bash
git clone <repository-url>
cd gigwidget
pnpm install
```

### 2. Development

```bash
# Run all packages in dev mode
pnpm dev

# Run only the web app
pnpm --filter @gigwidget/web dev

# Build all packages
pnpm build

# Type check
pnpm typecheck

# Format code
pnpm format
```

### 3. Project Structure

```
gigwidget/
├── apps/
│   └── web/          # SvelteKit PWA (main application)
├── packages/
│   ├── core/         # Domain models, Yjs stores, services
│   ├── db/           # IndexedDB (Dexie) schema & repositories
│   ├── sync/         # CRDT providers & session management
│   └── ui/           # Shared Svelte components
└── docs/             # Documentation
```

---

## Package Overview

### @gigwidget/core

Core domain logic with no UI dependencies.

**Exports:**
- `models/` - TypeScript interfaces for all domain entities
- `stores/` - Yjs document definitions and accessors
- `services/` - Business logic (create song, detect conflict, etc.)

**Usage:**
```typescript
import { createSong, createArrangement, Song } from '@gigwidget/core';
import { createSongDoc, SongDoc } from '@gigwidget/core/stores';

const song = createSong(userId, 'My Song', { artist: 'Me', key: 'G' });
const doc = createSongDoc(song.id);
const metadata = SongDoc.getMetadata(doc);
```

### @gigwidget/db

IndexedDB persistence layer.

**Exports:**
- `getDatabase()` - Get Dexie database instance
- `initializeDatabase()` - Initialize DB and create anonymous user
- `*Repository` - Data access patterns for each entity

**Usage:**
```typescript
import { initializeDatabase, SongRepository } from '@gigwidget/db';

const user = await initializeDatabase();
const songs = await SongRepository.getByOwner(user.id);
await SongRepository.create(newSong);
```

### @gigwidget/sync

CRDT synchronization providers.

**Exports:**
- `SupabaseProvider` - Cloud sync via Supabase
- `BluetoothProvider` - P2P sync via Bluetooth LE
- `WebrtcProvider` - Re-exported from y-webrtc
- `IndexeddbPersistence` - Re-exported from y-indexeddb
- `SessionManager` - Ad-hoc session management
- `generateQRCodeDataURL()` - QR code generation

**Usage:**
```typescript
import { SupabaseProvider, SessionManager } from '@gigwidget/sync';
import * as Y from 'yjs';

// Cloud sync
const doc = new Y.Doc();
const provider = new SupabaseProvider(doc, { supabase, roomName: 'my-doc' });
await provider.connect();

// Session sharing
const manager = new SessionManager({ user });
const qrPayload = await manager.createSession(songManifest);
```

### @gigwidget/ui

Shared Svelte components (coming soon).

---

## Key Patterns

### Local-First Data Flow

1. User action triggers store update
2. Store updates IndexedDB (Dexie) immediately
3. Yjs document updates trigger sync providers
4. UI reflects local state instantly
5. Remote sync happens in background

```svelte
<script>
  import { getDatabase, SongRepository } from '@gigwidget/db';

  async function createSong() {
    const song = createSong(userId, title);

    // 1. Save to IndexedDB (instant)
    await SongRepository.create(song);

    // 2. Update Yjs doc (triggers sync)
    const doc = createSongDoc(song.id);
    SongDoc.getMetadata(doc).set('title', title);

    // 3. UI updates via Svelte reactivity
    songs = [...songs, song];
  }
</script>
```

### Yjs Document Binding

Each song has its own Yjs document for fine-grained sync:

```typescript
// Create document
const doc = createSongDoc(songId);

// Get typed accessors
const metadata = SongDoc.getMetadata(doc);
const content = SongDoc.getArrangementContent(doc, arrangementId);

// Observe changes
metadata.observe((event) => {
  console.log('Metadata changed:', event.changes);
});

// Edit content (propagates via CRDT)
content.insert(0, '[G]Hello [C]World');
```

### Session Sharing Flow

```typescript
import { SessionManager, generateQRCodeDataURL } from '@gigwidget/sync';

// Host creates session
const manager = new SessionManager({ user });

const manifest = songs.map(s => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  instruments: arrangements.map(a => a.instrument)
}));

const payload = await manager.createSession(manifest, {
  type: 'webrtc',
  libraryScope: 'selected',
  selectedSongIds: ['song-1', 'song-2']
});

// Generate QR code
const qrDataUrl = await generateQRCodeDataURL(payload);

// Guest scans and joins
await manager.joinSession({ payload: decodedPayload });
```

---

## Environment Variables

Create `.env.local` in `apps/web/`:

```env
# Supabase (optional - for cloud sync)
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# WebRTC Signaling (optional - uses public servers by default)
PUBLIC_SIGNALING_SERVERS=wss://your-signaling-server.com
```

---

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run tests for specific package
pnpm --filter @gigwidget/core test
```

---

## Building for Production

### Web (PWA)

```bash
pnpm --filter @gigwidget/web build
# Output in apps/web/build/
```

### Mobile (Capacitor)

```bash
cd apps/mobile
pnpm cap sync
pnpm cap open ios    # or android
```

### Desktop (Tauri)

```bash
cd apps/desktop
pnpm tauri build
```

---

## Common Tasks

### Adding a New Entity

1. Define interface in `packages/core/src/models/index.ts`
2. Add Dexie table in `packages/db/src/schema.ts`
3. Create repository in `packages/db/src/repositories/index.ts`
4. Add Yjs document structure in `packages/core/src/stores/index.ts` (if needed)
5. Create service functions in `packages/core/src/services/index.ts`

### Adding a New Sync Provider

1. Create provider class in `packages/sync/src/providers/`
2. Extend `Observable` base class
3. Implement `connect()`, `disconnect()`, `destroy()`
4. Handle document updates and apply remote changes
5. Export from `packages/sync/src/providers/index.ts`

### Adding a New UI Component

1. Create component in `packages/ui/src/components/`
2. Export from `packages/ui/src/components/index.ts`
3. Import in app: `import { MyComponent } from '@gigwidget/ui/components'`
