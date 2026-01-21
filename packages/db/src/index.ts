/**
 * @gigwidget/db
 *
 * IndexedDB persistence layer using Dexie.
 * Provides schema definitions and repository patterns for all domain entities.
 */

// Schema and database
export {
  GigwidgetDatabase,
  getDatabase,
  closeDatabase,
  initializeDatabase,
} from './schema.js';

// Repositories
export {
  SongRepository,
  ArrangementRepository,
  SnapshotRepository,
  SpaceRepository,
  MembershipRepository,
  SessionRepository,
  ConflictRepository,
  CustomInstrumentRepository,
  LocalFingeringRepository,
  SongMetadataRepository,
  SongSetRepository,
} from './repositories/index.js';
