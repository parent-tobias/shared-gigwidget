# Gigwidget - Project Overview

**Gigwidget** is a local-first TAB music sharing app designed for musicians to create, edit, and share guitar tabs, chord charts, and other musical notation.

## Vision

A fully offline-capable application that allows musicians to:
- Create and edit songs in ChordPro format
- Share music instantly at jam sessions and workshops
- Sync libraries across devices when online
- Collaborate in real-time with other musicians

## Core Principles

1. **Local-First**: The app works completely offline from first launch. No network required ever for core functionality.

2. **Privacy by Default**: Users own their data. Sharing is explicit and controlled.

3. **Peer-to-Peer**: Direct device-to-device sharing without requiring cloud infrastructure.

4. **Progressive Enhancement**: Basic features work everywhere; advanced features (cloud sync, real-time collaboration) enhance the experience when available.

## Target Users

- **Solo Musicians**: Managing personal chord/tab libraries
- **Bands**: Sharing setlists and arrangements among members
- **Teachers**: Distributing materials to students in workshops
- **Jam Session Participants**: Quick sharing at impromptu gatherings

## Key Features

### Implemented
- [ ] ChordPro editor with live preview
- [ ] Multi-instrument support (guitar, bass, ukulele, drums, etc.)
- [ ] Local IndexedDB storage
- [ ] Anonymous user creation

### Planned
- [ ] CRDT-based real-time sync
- [ ] QR code session sharing
- [ ] WebRTC peer-to-peer sync
- [ ] Bluetooth fallback for offline P2P
- [ ] Supabase cloud backup
- [ ] Authentication upgrade path
- [ ] Version history (last 10 snapshots)
- [ ] Conflict detection and resolution
- [ ] PWA with full offline support
- [ ] iOS/Android via Capacitor
- [ ] Desktop via Tauri
