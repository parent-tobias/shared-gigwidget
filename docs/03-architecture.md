# Architecture

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Package Manager | pnpm | Fast, efficient disk usage |
| Monorepo | Turborepo | Simple caching, works well with pnpm |
| UI Framework | SvelteKit | Small bundles, great DX, native reactivity |
| CRDT | Yjs | Mature, y-indexeddb, y-webrtc built-in |
| Local Storage | IndexedDB (Dexie + y-indexeddb) | Dexie for structured data, Yjs for CRDT docs |
| Auth | Supabase Auth | Anonymous → upgrade flow, multiple providers |
| Cloud Sync | Supabase Realtime + Storage | Custom Yjs provider over Realtime channels |
| P2P (online) | y-webrtc | Built-in Yjs provider, mesh topology |
| P2P (offline) | Web Bluetooth API | Fallback for no-network scenarios |
| QR Codes | qrcode / html5-qrcode | Generation and scanning |
| Mobile | Capacitor | iOS/Android from same codebase |
| Desktop | Tauri | Smaller than Electron, Rust backend |
| ChordPro | @parent-tobias/* packages | Editor, renderer, filesystem |

---

## Project Structure

```
gigwidget/
├── apps/
│   ├── web/                    # SvelteKit PWA
│   ├── mobile/                 # Capacitor wrapper
│   └── desktop/                # Tauri wrapper
├── packages/
│   ├── core/                   # Domain models, Yjs stores, services
│   │   └── src/
│   │       ├── models/         # TypeScript interfaces
│   │       ├── stores/         # Yjs document definitions
│   │       └── services/       # Domain logic
│   ├── sync/                   # CRDT sync providers
│   │   └── src/
│   │       ├── providers/      # Supabase, Bluetooth providers
│   │       └── session/        # Ad-hoc session management, QR
│   ├── ui/                     # Shared Svelte components
│   │   └── src/
│   │       ├── components/
│   │       ├── layouts/
│   │       └── styles/
│   └── db/                     # IndexedDB schema & repositories
│       └── src/
│           ├── schema.ts       # Dexie database definition
│           └── repositories/   # Data access patterns
├── docs/                       # Documentation
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Data Layer Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         CLIENT                                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │   UI Layer  │───▶│ Svelte      │───▶│ CRDT Document Store │    │
│  │  (Svelte)   │    │   Stores    │    │       (Yjs)         │    │
│  └─────────────┘    └─────────────┘    └──────────┬──────────┘    │
│                                                    │                │
│                           ┌────────────────────────┼───────────┐   │
│                           │                        │           │   │
│                           ▼                        ▼           ▼   │
│                    ┌──────────┐           ┌───────────┐ ┌────────┐│
│                    │ IndexedDB│           │  WebRTC   │ │Bluetooth││
│                    │ (Dexie)  │           │  Peers    │ │  Peers ││
│                    └──────────┘           └───────────┘ └────────┘│
│                                                    │               │
└────────────────────────────────────────────────────┼───────────────┘
                                                     │
                         ┌───────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                       SUPABASE (Optional)                           │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────────────┐  │
│  │   Auth   │    │  Realtime    │    │      Storage            │  │
│  │ (anon +  │    │ (sync channel│    │  (CRDT state vectors,   │  │
│  │ upgrade) │    │  for spaces) │    │   user backups)         │  │
│  └──────────┘    └──────────────┘    └─────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Yjs Document Strategy

Each entity type has its own document structure:

### Song Document
- One Y.Doc per song (guid: `song-{songId}`)
- Enables fine-grained sync (only sync changed songs)
- Enables selective sharing (share individual songs)
- Contains:
  - `metadata` (Y.Map): title, artist, key, tempo
  - `arrangements` (Y.Array): arrangement references
  - `contents` (Y.Map): arrangementId → Y.Text for content
  - `tags` (Y.Array): string tags

### Library Document
- One Y.Doc per user (guid: `library-{userId}`)
- Lightweight references, not full content
- Contains:
  - `songs` (Y.Map): songId → minimal metadata
  - `spaces` (Y.Array): space memberships
  - `syncState` (Y.Map): sync tracking

### Space Document
- One Y.Doc per space (guid: `space-{spaceId}`)
- Shared among all members
- Contains:
  - `metadata` (Y.Map): name, description, type
  - `members` (Y.Map): userId → role
  - `songIds` (Y.Array): shared song references
  - `settings` (Y.Map): space configuration

---

## Sync Topology

```
                    ┌─────────────────┐
                    │    Supabase     │
                    │  (hub for cloud │
                    │   sync users)   │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
       ┌────────┐       ┌────────┐       ┌────────┐
       │ User A │◀─────▶│ User B │◀─────▶│ User C │
       │ (host) │ WebRTC│        │ WebRTC│        │
       └────────┘       └────────┘       └────────┘
            │
            │ Bluetooth (fallback)
            ▼
       ┌────────┐
       │ User D │
       │(no wifi)│
       └────────┘
```

**Transport Priority:**
1. WebRTC (when online)
2. Local network / mDNS (same WiFi, no internet)
3. Bluetooth LE (no network at all)

---

## Offline-First Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE-FIRST ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PWA Requirements:                                               │
│  ├── Service Worker caches full app shell                       │
│  ├── All UI assets bundled (no CDN dependencies)                │
│  ├── @parent-tobias packages bundled locally                    │
│  └── IndexedDB initialized on first open                        │
│                                                                  │
│  Data Flow:                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ User Action  │────▶│ Local Store  │────▶│   UI Update  │    │
│  └──────────────┘     │  (IndexedDB) │     └──────────────┘    │
│                       └──────┬───────┘                          │
│                              │ (when online)                    │
│                              ▼                                   │
│                       ┌──────────────┐                          │
│                       │  Sync Queue  │                          │
│                       │ (background) │                          │
│                       └──────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Conflict Resolution Flow

```
┌──────────────┐
│ Original     │ (baseVersion)
└──────┬───────┘
       │
  ┌────┴────┐
  ▼         ▼
┌─────┐  ┌─────┐
│Local│  │Remote│
│Edit │  │Edit  │
└──┬──┘  └──┬───┘
   │        │
   ▼        ▼
┌────────────────────────────────────────┐
│ User sees: "Conflicting edits detected"│
│ Options:                               │
│  [Keep Mine] [Keep Theirs] [Keep Both] │
└────────────────────────────────────────┘

"Keep Both" creates forked arrangements:
- "Song Name (conflict - User A - Jan 20)"
- "Song Name (conflict - User B - Jan 20)"
```

---

## QR Code Session Flow

```
1. Host creates Session
   └── Selects transport (auto-detected or manual)
   └── Selects library scope (full or selected songs)

2. Session generates connection info:
   ├── WebRTC: signaling server + room ID
   ├── Bluetooth: service UUID + characteristics
   └── Local network: IP addresses + port + token

3. QR encodes SessionPayload:
   {
     sessionId, type, hostId, hostName,
     connectionInfo, libraryManifest,
     createdAt, expiresAt
   }

4. Scanner decodes QR
   └── Joins session via appropriate transport
   └── Receives CRDT state
   └── Library syncs in real-time

5. Session ends
   └── Connections closed
   └── Synced content remains local
```
