/**
 * Chord Resolution Service
 *
 * Implements the priority chain for chord lookup:
 * 1. Song-level override (if songId provided)
 * 2. User custom chord (LocalFingering)
 * 3. System override chord (Supabase)
 * 4. Dynamic generation (chord-component)
 */

import type { LocalFingering, SystemChord, SongChordOverride } from '../models/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ResolvedChord {
  chordName: string;
  instrumentId: string;
  positions: number[];
  fingers?: number[];
  barres?: Array<{ fret: number; fromString: number; toString: number }>;
  baseFret: number;
  source: 'user-custom' | 'system-override' | 'dynamic' | 'song-override';
  metadata?: {
    createdBy?: string;
    createdByName?: string;
    description?: string;
    isDefault?: boolean;
  };
}

export interface ChordResolutionOptions {
  userId: string;
  chordName: string;
  instrumentId: string;
  preferUserCustom?: boolean;
}

export interface SongChordResolutionOptions extends ChordResolutionOptions {
  songId: string;
}

// ============================================================================
// Chord Resolution Service
// ============================================================================

export class ChordResolutionService {
  /**
   * Resolve a chord through the priority chain (without song context)
   */
  async resolveChord(options: ChordResolutionOptions): Promise<ResolvedChord | null> {
    const { userId, chordName, instrumentId, preferUserCustom = true } = options;

    // Priority 1: User custom chord
    if (preferUserCustom) {
      const userChord = await this.getUserCustomChord(userId, chordName, instrumentId);
      if (userChord) {
        return this.mapLocalFingeringToResolved(userChord, 'user-custom');
      }
    }

    // Priority 2: System override chord
    const systemChord = await this.getSystemOverrideChord(chordName, instrumentId);
    if (systemChord) {
      return this.mapSystemChordToResolved(systemChord, 'system-override');
    }

    // Priority 3: Dynamic generation (chord-component)
    const dynamicChord = await this.getDynamicChord(chordName, instrumentId);
    if (dynamicChord) {
      return dynamicChord;
    }

    // No chord found
    return null;
  }

  /**
   * Resolve a chord for a specific song (includes song-level overrides)
   */
  async resolveChordForSong(
    options: SongChordResolutionOptions
  ): Promise<ResolvedChord | null> {
    const { userId, songId, chordName, instrumentId } = options;

    // Priority 0: Check for song-level override first
    const songOverride = await this.getSongChordOverride(userId, songId, chordName);
    if (songOverride) {
      // Resolve the specific variation the user chose
      const resolvedVariation = await this.resolveSpecificVariation(
        userId,
        chordName,
        instrumentId,
        songOverride.selectedSource,
        songOverride.selectedVariationId
      );
      if (resolvedVariation) {
        // Mark it as song-override source
        return { ...resolvedVariation, source: 'song-override' };
      }
    }

    // Fall back to default resolution if no song override
    return this.resolveChord({ userId, chordName, instrumentId });
  }

  /**
   * Get all chord variations for a given chord name
   * Returns all available fingerings from all sources
   */
  async getAllChordVariations(
    userId: string,
    chordName: string,
    instrumentId: string
  ): Promise<ResolvedChord[]> {
    const variations: ResolvedChord[] = [];

    // Get user custom chords
    const userChords = await this.getUserCustomChords(userId, chordName, instrumentId);
    variations.push(
      ...userChords.map((c) => this.mapLocalFingeringToResolved(c, 'user-custom'))
    );

    // Get system override
    const systemChord = await this.getSystemOverrideChord(chordName, instrumentId);
    if (systemChord) {
      variations.push(this.mapSystemChordToResolved(systemChord, 'system-override'));
    }

    // Get dynamic chord
    const dynamicChord = await this.getDynamicChord(chordName, instrumentId);
    if (dynamicChord) {
      variations.push(dynamicChord);
    }

    return variations;
  }

  // ==========================================================================
  // Private: Song-level override resolution
  // ==========================================================================

  /**
   * Get song-level chord override from IndexedDB
   */
  private async getSongChordOverride(
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

  /**
   * Resolve a specific variation based on source and ID
   */
  private async resolveSpecificVariation(
    userId: string,
    chordName: string,
    instrumentId: string,
    source: 'user-custom' | 'system-override' | 'dynamic',
    variationId?: string
  ): Promise<ResolvedChord | null> {
    switch (source) {
      case 'user-custom': {
        if (!variationId) return null;
        const userChord = await this.getUserCustomChordById(variationId);
        return userChord
          ? this.mapLocalFingeringToResolved(userChord, 'user-custom')
          : null;
      }
      case 'system-override': {
        const systemChord = await this.getSystemOverrideChord(chordName, instrumentId);
        return systemChord
          ? this.mapSystemChordToResolved(systemChord, 'system-override')
          : null;
      }
      case 'dynamic': {
        return this.getDynamicChord(chordName, instrumentId);
      }
      default:
        return null;
    }
  }

  // ==========================================================================
  // Private: User custom chord methods
  // ==========================================================================

  /**
   * Get default user custom chord from IndexedDB
   */
  private async getUserCustomChord(
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

  /**
   * Get user custom chord by ID
   */
  private async getUserCustomChordById(id: string): Promise<LocalFingering | null> {
    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      return (await LocalFingeringRepository.getById(id)) ?? null;
    } catch (err) {
      console.error('[ChordResolution] Failed to get user custom chord by ID:', err);
      return null;
    }
  }

  /**
   * Get all user custom chords for a chord name
   */
  private async getUserCustomChords(
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

  // ==========================================================================
  // Private: System override chord methods
  // ==========================================================================

  /**
   * Get system override chord from cache or Supabase
   * This method will be overridden in the web app layer
   */
  private async getSystemOverrideChord(
    _chordName: string,
    _instrumentId: string
  ): Promise<SystemChord | null> {
    // Default implementation returns null
    // Web app layer will inject Supabase integration
    console.warn('[ChordResolution] getSystemOverrideChord not implemented - override in web layer');
    return null;
  }

  // ==========================================================================
  // Private: Dynamic chord generation
  // ==========================================================================

  /**
   * Get dynamic chord from chord-component
   */
  private async getDynamicChord(
    chordName: string,
    instrumentId: string
  ): Promise<ResolvedChord | null> {
    try {
      // Import chord-component service
      // Note: This is optional - the chord-component may not be available in all contexts
      const { chordDataService } = await import('@parent-tobias/chord-component');

      const chordData = await chordDataService.getChord(instrumentId, chordName, false);

      if (chordData && chordData.fingers && chordData.fingers.length > 0) {
        // Convert from chord-component format to our format
        return {
          chordName,
          instrumentId,
          positions: chordData.fingers.map(([, fret]) => fret),
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

  // ==========================================================================
  // Private: Mapping helpers
  // ==========================================================================

  /**
   * Map LocalFingering to ResolvedChord
   */
  private mapLocalFingeringToResolved(
    fingering: LocalFingering,
    source: 'user-custom'
  ): ResolvedChord {
    return {
      chordName: fingering.chordName,
      instrumentId: fingering.instrumentId,
      positions: fingering.positions,
      fingers: fingering.fingers,
      barres: fingering.barres
        ? fingering.barres.map((b) => ({
            fret: b.fret,
            fromString: b.fromString,
            toString: b.toString,
          }))
        : [],
      baseFret: fingering.baseFret,
      source,
      metadata: {
        isDefault: fingering.isDefault,
      },
    };
  }

  /**
   * Map SystemChord to ResolvedChord
   */
  private mapSystemChordToResolved(
    chord: SystemChord,
    source: 'system-override'
  ): ResolvedChord {
    return {
      chordName: chord.chordName,
      instrumentId: chord.instrumentId,
      positions: chord.positions,
      fingers: chord.fingers,
      barres: chord.barres
        ? chord.barres.map((b) => ({
            fret: b.fret,
            fromString: b.fromString,
            toString: b.toString,
          }))
        : [],
      baseFret: chord.baseFret,
      source,
      metadata: {
        createdBy: chord.createdBy,
        createdByName: chord.createdByName,
        description: chord.description,
      },
    };
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const chordResolutionService = new ChordResolutionService();
