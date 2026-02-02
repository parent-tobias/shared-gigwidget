/**
 * Web-specific chord resolution with Supabase integration
 *
 * This module extends the core ChordResolutionService with Supabase support
 * for fetching system chords created by moderators.
 */

import {
  chordResolutionService,
  type ResolvedChord,
  type ChordResolutionOptions,
  type SongChordResolutionOptions,
  type SystemChord,
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
// Supabase Integration
// ============================================================================

/**
 * Fetch system chord from Supabase with caching.
 */
async function fetchSystemChordWithCache(
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

/**
 * Override the core service's getSystemOverrideChord method.
 * This is done by monkey-patching the private method.
 */
function injectSupabaseIntegration(): void {
  // Access the private method via prototype
  const proto = Object.getPrototypeOf(chordResolutionService);

  // Store original method (in case we need to restore it)
  const originalMethod = proto.getSystemOverrideChord;

  // Override with Supabase integration
  proto.getSystemOverrideChord = async function (
    chordName: string,
    instrumentId: string
  ): Promise<SystemChord | null> {
    return fetchSystemChordWithCache(chordName, instrumentId);
  };

  console.log('[ChordResolution] Supabase integration injected');
}

// Inject on module load
injectSupabaseIntegration();

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
