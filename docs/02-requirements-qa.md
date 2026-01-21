# Requirements Q&A

This document captures the key decisions made during the initial planning phase.

---

## Content & Instruments

**Q: What types of TAB content will users be working with?**

**A: Multi-instrument**
- Guitar (6-string)
- Bass (4-string)
- Ukulele
- Banjo
- Mandolin
- Drums
- Keys
- Vocals
- Other

The app will support standard ChordPro format with extensions for different instruments. Each song can have multiple "arrangements" for different instruments.

---

## Sharing Model

**Q: How do you envision the sharing model?**

**A: Hybrid Approach**
- Users have a private library by default
- Songs can be explicitly shared to "Spaces" (shared collections)
- Spaces can be:
  - **Personal**: Private cloud backup
  - **Group**: Shared among members (band, class, etc.)
  - **Public**: Open to anyone with the link

---

## QR Code Use Cases

**Q: What's the primary use case for QR code sharing?**

**A: Multiple scenarios (multi-select)**
1. **Jam Sessions**: Quick sharing at in-person gatherings, temporary sync
2. **Teaching/Workshops**: Instructor shares library with students

The QR code encodes session connection information, allowing anyone who scans it to join the sharing session and receive the shared library.

---

## Cloud Sync

**Q: Should the remote sync be per-user or shared spaces?**

**A: Both Models**
- Each user can have their own cloud backup (personal Supabase storage)
- Groups/communities can have shared cloud storage that members sync to

This allows:
- Personal backup without sharing
- Collaborative spaces with persistent cloud sync
- Offline-first with optional cloud enhancement

---

## Version History

**Q: What level of version history do you need?**

**A: Recent Snapshots (Last 10)**
- Keep the last 10 versions per arrangement
- Snapshots are created on significant edits (auto-save threshold)
- Users can restore any of the last 10 versions
- Older versions are pruned automatically

This balances storage efficiency with practical undo needs.

---

## Authentication

**Q: What providers should be supported?**

**A: Anonymous + Upgrade Path**
1. Users start as anonymous (local UUID)
2. All features work without signing in
3. Optional: "Sign in to backup to cloud"
4. Sign-in links local data to Supabase account
5. Supports email/password, Google, GitHub, Apple via Supabase Auth

This removes friction for new users while enabling cloud features for those who want them.

---

## Platform Support

**Q: Web-only or native mobile/desktop?**

**A: All Platforms**
- **Web**: Progressive Web App (PWA)
- **Mobile**: iOS & Android via Capacitor
- **Desktop**: macOS, Windows, Linux via Tauri

Single SvelteKit codebase adapts to all platforms.

---

## Group Size

**Q: What's the expected group size for sharing sessions?**

**A: Medium (5-20 people)**
- Small band scenarios
- Larger bands
- Small workshops

This influences the P2P architecture:
- WebRTC mesh is suitable for this size
- Bluetooth can handle sequential connections
- No need for SFU/media server complexity

---

## Conflict Resolution

**Q: How should we handle conflicts when the same song is edited offline by multiple users?**

**A: Fork on Conflict**
- When both local and remote have changed since last sync, create a conflict
- User sees: "Conflicting edits detected"
- Options:
  - **Keep Mine**: Discard remote changes
  - **Keep Theirs**: Discard local changes
  - **Keep Both**: Create two versions (forked arrangements)

This is more user-friendly for creative content where automatic merging could produce unintended results.

---

## Offline Requirements

**Q: Should the app work completely offline on first launch?**

**A: Fully Offline**
- Works immediately on first open
- No network required ever for core functionality
- All assets bundled in the app
- IndexedDB initialized with default schema on first open
- Anonymous user created locally
- Cloud features are progressive enhancements

---

## Technical Preferences

**Q: CRDT library preference?**

**A: Yjs**
- Mature and well-tested
- Excellent performance
- Built-in WebRTC provider (y-webrtc)
- Built-in IndexedDB persistence (y-indexeddb)
- Sub-document support for per-song sync
- Active community and maintenance

---

**Q: UI framework preference?**

**A: Svelte / SvelteKit**
- Smaller bundle sizes
- Great performance
- Excellent developer experience
- Native reactivity works well with Yjs
- SvelteKit provides SSG, routing, and adapters

---

**Q: Monorepo tooling?**

**A: Turborepo**
- Simpler than Nx
- Great caching
- Works well with pnpm
- Sufficient for this project's needs

---

## Project Name

**Q: What would you like to name the project?**

**A: Gigwidget**

A playful name combining "gig" (musical performance) with "widget" (a small useful tool).
