/**
 * Web-specific chord resolution with Supabase integration
 *
 * This module implements the ChordDataProvider interface and injects it
 * into the core ChordResolutionService with full Supabase support.
 */

import {
  chordResolutionService,
  type ChordDataProvider,
  type ResolvedChord,
  type ChordResolutionOptions,
  type SongChordResolutionOptions,
  type SystemChord,
  type LocalFingering,
  type SongChordOverride,
} from '@gigwidget/core';
import { getSystemChord } from '../stores/supabaseStore';

// ============================================================================
// System Chord Cache
// ============================================================================

/**
 * In-memory cache for system chords fetched from Supabase.
 * Key format: "instrumentId:chordName"
 * Value: SystemChord or null (null = checked but not found)
 */
const systemChordCache = new Map<string, SystemChord | null>();

/**
 * Clear the system chord cache.
 * Call this after moderators create/update system chords.
 */
export function clearSystemChordCache(): void {
  systemChordCache.clear();
  console.log('[ChordResolution] Cache cleared');
}

/**
 * Clear cache for a specific chord.
 * Useful when a moderator updates a single chord.
 */
export function clearSystemChordCacheForChord(
  instrumentId: string,
  chordName: string
): void {
  const cacheKey = `${instrumentId}:${chordName}`;
  systemChordCache.delete(cacheKey);
  console.log(`[ChordResolution] Cache cleared for ${cacheKey}`);
}

// ============================================================================
// Web Data Provider Implementation
// ============================================================================

class WebChordDataProvider implements ChordDataProvider {
  // Song-level overrides
  async getSongChordOverride(
    userId: string,
    songId: string,
    chordName: string
  ): Promise<SongChordOverride | null> {
    try {
      const { SongChordOverrideRepository } = await import('@gigwidget/db');
      return (await SongChordOverrideRepository.getForChord(userId, songId, chordName)) ?? null;
    } catch (err) {
      console.error('[ChordResolution] Failed to get song chord override:', err);
      return null;
    }
  }

  // User custom chords
  async getUserCustomChord(
    userId: string,
    chordName: string,
    instrumentId: string
  ): Promise<LocalFingering | null> {
    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      return (
        (await LocalFingeringRepository.getDefault(userId, chordName, instrumentId)) ?? null
      );
    } catch (err) {
      console.error('[ChordResolution] Failed to get user custom chord:', err);
      return null;
    }
  }

  async getUserCustomChordById(id: string): Promise<LocalFingering | null> {
    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      return (await LocalFingeringRepository.getById(id)) ?? null;
    } catch (err) {
      console.error('[ChordResolution] Failed to get user custom chord by ID:', err);
      return null;
    }
  }

  async getUserCustomChords(
    userId: string,
    chordName: string,
    instrumentId: string
  ): Promise<LocalFingering[]> {
    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      const allUserChords = await LocalFingeringRepository.getByChord(userId, chordName);
      return allUserChords.filter((c) => c.instrumentId === instrumentId);
    } catch (err) {
      console.error('[ChordResolution] Failed to get user custom chords:', err);
      return [];
    }
  }

  // System override chords (with Supabase integration)
  async getSystemOverrideChord(
    chordName: string,
    instrumentId: string
  ): Promise<SystemChord | null> {
    const cacheKey = `${instrumentId}:${chordName}`;

    // Check cache first
    if (systemChordCache.has(cacheKey)) {
      return systemChordCache.get(cacheKey) ?? null;
    }

    // Fetch from Supabase
    try {
      const { data, error } = await getSystemChord(chordName, instrumentId);

      if (error) {
        console.error('[ChordResolution] Error fetching system chord:', error);
        // Don't cache errors
        return null;
      }

      // Convert Supabase format to SystemChord
      const systemChord: SystemChord | null = data
        ? {
            id: data.id,
            chordName: data.chord_name,
            instrumentId: data.instrument_id,
            positions: data.positions,
            fingers: data.fingers ?? undefined,
            barres: data.barres
              ? data.barres.map((b: any) => ({
                  fret: b.fret,
                  fromString: b.fromString,
                  toString: b.toString,
                }))
              : undefined,
            baseFret: data.base_fret,
            createdBy: data.created_by,
            createdByName: data.created_by_name,
            description: data.description ?? undefined,
            createdAt: new Date(data.created_at),
            updatedAt: new Date(data.updated_at),
          }
        : null;

      // Cache the result (including null for "not found")
      systemChordCache.set(cacheKey, systemChord);

      return systemChord;
    } catch (err) {
      console.error('[ChordResolution] Exception fetching system chord:', err);
      return null;
    }
  }

  // Dynamic generation (chord-component)
  async getDynamicChord(chordName: string, instrumentId: string): Promise<ResolvedChord | null> {
    try {
      // Check if custom elements are already defined before importing
      // If not, import the package (which will register them)
      if (typeof window !== 'undefined' && !customElements.get('chord-diagram')) {
        try {
          await import('@parent-tobias/chord-component');
        } catch (importErr) {
          // Ignore "already defined" errors
          if (!(importErr instanceof DOMException && importErr.message.includes('already been defined'))) {
            throw importErr;
          }
        }
      }

      // Import chord-component service
      const { chordDataService } = await import('@parent-tobias/chord-component');

      const chordData = await chordDataService.getChord(instrumentId, chordName, false);

      if (chordData && chordData.fingers && chordData.fingers.length > 0) {
        // Convert from chord-component format to our format
        return {
          chordName,
          instrumentId,
          positions: chordData.fingers.map(([, fret]: [number, number]) => fret),
          fingers: chordData.fingers.map(() => 0), // chord-component doesn't specify finger numbers
          barres: chordData.barres
            ? chordData.barres.map((b: any) => ({
                fret: b.fret,
                fromString: b.fromString,
                toString: b.toString,
              }))
            : [],
          baseFret: chordData.position ?? 1,
          source: 'dynamic',
        };
      }

      return null;
    } catch (err) {
      console.error('[ChordResolution] Failed to get dynamic chord:', err);
      return null;
    }
  }
}

// ============================================================================
// Initialize Service
// ============================================================================

// Create and inject the data provider on module load
const dataProvider = new WebChordDataProvider();
chordResolutionService.setDataProvider(dataProvider);

console.log('[ChordResolution] Web data provider initialized');

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolve a chord with full Supabase system chord support.
 * This is the main entry point for the web app.
 */
export async function resolveChordWithSystemChords(
  options: ChordResolutionOptions
): Promise<ResolvedChord | null> {
  return chordResolutionService.resolveChord(options);
}

/**
 * Resolve a chord for a specific song (includes song-level overrides).
 */
export async function resolveChordForSongWithSystemChords(
  options: SongChordResolutionOptions
): Promise<ResolvedChord | null> {
  return chordResolutionService.resolveChordForSong(options);
}

/**
 * Get all chord variations for a given chord name.
 */
export async function getAllChordVariationsWithSystemChords(
  userId: string,
  chordName: string,
  instrumentId: string
): Promise<ResolvedChord[]> {
  return chordResolutionService.getAllChordVariations(userId, chordName, instrumentId);
}

// Re-export the core service for direct access if needed
export { chordResolutionService };
