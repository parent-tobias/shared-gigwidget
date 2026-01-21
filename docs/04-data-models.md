# Data Models

## Core Types

### Instruments

```typescript
type Instrument =
  | 'guitar'
  | 'bass'
  | 'ukulele'
  | 'banjo'
  | 'mandolin'
  | 'drums'
  | 'keys'
  | 'vocals'
  | 'other';
```

### Musical Keys

```typescript
type MusicalKey =
  | 'C' | 'C#' | 'Db' | 'D' | 'D#' | 'Eb' | 'E' | 'F'
  | 'F#' | 'Gb' | 'G' | 'G#' | 'Ab' | 'A' | 'A#' | 'Bb' | 'B'
  | 'Cm' | 'C#m' | 'Dm' | 'D#m' | 'Ebm' | 'Em' | 'Fm'
  | 'F#m' | 'Gm' | 'G#m' | 'Am' | 'A#m' | 'Bbm' | 'Bm';
```

### Visibility

```typescript
type Visibility = 'private' | 'space' | 'public';
```

---

## User Domain

### User

```typescript
interface User {
  id: string;              // Local UUID (persists after auth upgrade)
  supabaseId?: string;     // Set when authenticated
  displayName: string;
  avatar?: Blob;
  instruments: Instrument[];
  createdAt: Date;
  lastSyncAt?: Date;
}
```

### UserPreferences

```typescript
interface UserPreferences {
  userId: string;
  defaultInstrument?: Instrument;
  defaultTuning?: string;
  autoSaveInterval: number;     // ms, default 5000
  snapshotRetention: number;    // count, default 10
}
```

---

## Song Domain

### Song

The core content entity. Contains metadata and references to arrangements.

```typescript
interface Song {
  id: string;
  ownerId: string;
  title: string;
  artist?: string;
  key?: MusicalKey;
  tempo?: number;
  timeSignature?: [number, number];  // e.g., [4, 4] for 4/4 time
  tags: string[];
  visibility: Visibility;
  spaceIds: string[];                // Spaces this song is shared to
  createdAt: Date;
  updatedAt: Date;
  yjsDocId: string;                  // Reference to Yjs document
}
```

### Arrangement

A specific version of a song for a particular instrument.

```typescript
interface Arrangement {
  id: string;
  songId: string;
  instrument: Instrument;
  tuning?: string;            // e.g., "EADGBE", "DADGAD", "Drop D"
  capo?: number;              // Fret number
  content: string;            // ChordPro format
  version: number;
  baseVersionHash?: string;   // For conflict detection
  createdAt: Date;
  updatedAt: Date;
}
```

### Snapshot

Point-in-time backup of an arrangement for version history.

```typescript
interface Snapshot {
  id: string;
  songId: string;
  arrangementId: string;
  content: string;
  versionHash: string;
  createdAt: Date;
  note?: string;              // Optional user note
}
```

---

## Space Domain

### Space

A collection that can be shared among users.

```typescript
interface Space {
  id: string;
  name: string;
  description?: string;
  type: 'personal' | 'group' | 'public';
  ownerId: string;
  cloudEnabled: boolean;
  yjsDocId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Membership

Links users to spaces with role-based permissions.

```typescript
interface Membership {
  id: string;
  userId: string;
  spaceId: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Date;
}
```

---

## Session Domain

### Session

An ephemeral sharing session for ad-hoc P2P sync.

```typescript
interface Session {
  id: string;
  hostId: string;
  type: 'webrtc' | 'bluetooth' | 'local-network';
  connectionInfo: WebRTCConnectionInfo | BluetoothConnectionInfo | LocalNetworkConnectionInfo;
  libraryScope: 'full' | 'selected';
  selectedSongIds?: string[];
  createdAt: Date;
  expiresAt?: Date;
}
```

### Connection Info Types

```typescript
interface WebRTCConnectionInfo {
  type: 'webrtc';
  signalingServer: string;
  roomId: string;
  password?: string;
}

interface BluetoothConnectionInfo {
  type: 'bluetooth';
  serviceUUID: string;
  characteristicUUID: string;
  deviceName: string;
}

interface LocalNetworkConnectionInfo {
  type: 'local-network';
  addresses: string[];
  port: number;
  token: string;
}
```

### SessionParticipant

```typescript
interface SessionParticipant {
  sessionId: string;
  userId: string;
  displayName: string;
  joinedAt: Date;
  syncStatus: 'syncing' | 'synced' | 'error';
}
```

---

## Sync Domain

### SyncState

Tracks synchronization status for a user.

```typescript
interface SyncState {
  userId: string;
  lastLocalUpdate: Date;
  lastCloudSync?: Date;
  pendingChanges: number;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline';
  errorMessage?: string;
}
```

### ConflictInfo

Records conflicts for user resolution.

```typescript
interface ConflictInfo {
  id: string;
  songId: string;
  arrangementId: string;
  localContent: string;
  remoteContent: string;
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
  remoteUserId: string;
  remoteUserName?: string;
  detectedAt: Date;
  resolved: boolean;
  resolution?: 'keep-local' | 'keep-remote' | 'keep-both';
}
```

---

## QR Code Domain

### QRSessionPayload

The data encoded in QR codes for session joining.

```typescript
interface QRSessionPayload {
  sessionId: string;
  type: SessionType;
  hostId: string;
  hostName: string;
  connectionInfo: WebRTCConnectionInfo | BluetoothConnectionInfo | LocalNetworkConnectionInfo;
  libraryManifest: SongManifestEntry[];
  createdAt: number;
  expiresAt?: number;
}

interface SongManifestEntry {
  id: string;
  title: string;
  artist?: string;
  instruments: Instrument[];
}
```

---

## IndexedDB Schema

Using Dexie, the schema is defined with indexes for efficient queries:

```typescript
this.version(1).stores({
  // User tables
  users: 'id, supabaseId, createdAt',
  userPreferences: 'userId',

  // Song tables
  songs: 'id, ownerId, title, artist, visibility, updatedAt, *tags, *spaceIds',
  arrangements: 'id, songId, instrument, updatedAt',
  snapshots: 'id, songId, arrangementId, createdAt',

  // Space tables
  spaces: 'id, ownerId, type, name, createdAt',
  memberships: 'id, userId, spaceId, role',

  // Session tables
  sessions: 'id, hostId, type, createdAt, expiresAt',
  sessionParticipants: '[sessionId+userId], sessionId, userId',

  // Sync tables
  syncStates: 'userId, syncStatus',
  conflicts: 'id, songId, arrangementId, resolved, detectedAt',
});
```

**Index notation:**
- `id` - Primary key
- `field` - Indexed field
- `*field` - Multi-entry index (for arrays)
- `[a+b]` - Compound index
