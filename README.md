# Gigwidget

A local-first TAB music sharing app for musicians.

## Features

- **Local-First**: Works completely offline from first launch
- **Multi-Instrument**: Guitar, bass, ukulele, drums, and more
- **ChordPro Format**: Industry-standard chord chart notation
- **P2P Sharing**: Share instantly via QR code at jam sessions
- **P2P Bootstrap**: New users can scan a QR code to receive the app AND songs directly from the host device
- **Cloud Sync**: Optional Supabase backup when online
- **Cross-Platform**: Web, iOS, Android, macOS, Windows, Linux

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Open http://localhost:5173
```

## Project Structure

```
gigwidget/
├── apps/web/           # SvelteKit PWA
├── packages/
│   ├── core/           # Domain models & business logic
│   ├── db/             # IndexedDB persistence (Dexie)
│   ├── sync/           # CRDT sync providers (Yjs)
│   └── ui/             # Shared Svelte components
└── docs/               # Documentation
```

## Documentation

- [Project Overview](docs/01-project-overview.md)
- [Requirements Q&A](docs/02-requirements-qa.md)
- [Architecture](docs/03-architecture.md)
- [Data Models](docs/04-data-models.md)
- [Development Guide](docs/05-development-guide.md)
- [P2P Bootstrap System](docs/06-p2p-bootstrap-system.md)
- [Bootstrap Quick Start](docs/07-bootstrap-quick-start.md)

## Tech Stack

- **UI**: SvelteKit 2, Svelte 5
- **CRDT**: Yjs with y-indexeddb, y-webrtc
- **Storage**: IndexedDB via Dexie
- **Auth**: Supabase Auth (optional)
- **Build**: pnpm, Turborepo
- **Mobile**: Capacitor
- **Desktop**: Tauri

## License

MIT
