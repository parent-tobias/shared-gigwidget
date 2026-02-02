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
// Dependency Injection Interfaces
// ============================================================================

/**
 * Interface for data access operations
 * Implementations should be injected by the consuming layer
 */
export interface ChordDataProvider {
  // Song-level overrides
  getSongChordOverride(
    userId: string,
    songId: string,
    chordName: string
  ): Promise<SongChordOverride | null>;

  // User custom chords
  getUserCustomChord(
    userId: string,
    chordName: string,
    instrumentId: string
  ): Promise<LocalFingering | null>;

  getUserCustomChordById(id: string): Promise<LocalFingering | null>;

  getUserCustomChords(
    userId: string,
    chordName: string,
    instrumentId: string
  ): Promise<LocalFingering[]>;

  // System override chords
  getSystemOverrideChord(chordName: string, instrumentId: string): Promise<SystemChord | null>;

  // Dynamic generation
  getDynamicChord(chordName: string, instrumentId: string): Promise<ResolvedChord | null>;
}

// ============================================================================
// Chord Resolution Service
// ============================================================================

export class ChordResolutionService {
  private dataProvider?: ChordDataProvider;

  /**
   * Set the data provider for this service
   * Should be called by the consuming layer to inject dependencies
   */
  setDataProvider(provider: ChordDataProvider): void {
    this.dataProvider = provider;
  }

  /**
   * Resolve a chord through the priority chain (without song context)
   */
  async resolveChord(options: ChordResolutionOptions): Promise<ResolvedChord | null> {
    if (!this.dataProvider) {
      console.error('[ChordResolution] No data provider set');
      return null;
    }

    const { userId, chordName, instrumentId, preferUserCustom = true } = options;

    // Priority 1: User custom chord
    if (preferUserCustom) {
      const userChord = await this.dataProvider.getUserCustomChord(
        userId,
        chordName,
        instrumentId
      );
      if (userChord) {
        return this.mapLocalFingeringToResolved(userChord, 'user-custom');
      }
    }

    // Priority 2: System override chord
    const systemChord = await this.dataProvider.getSystemOverrideChord(chordName, instrumentId);
    if (systemChord) {
      return this.mapSystemChordToResolved(systemChord, 'system-override');
    }

    // Priority 3: Dynamic generation (chord-component)
    const dynamicChord = await this.dataProvider.getDynamicChord(chordName, instrumentId);
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
    if (!this.dataProvider) {
      console.error('[ChordResolution] No data provider set');
      return null;
    }

    const { userId, songId, chordName, instrumentId } = options;

    // Priority 0: Check for song-level override first
    const songOverride = await this.dataProvider.getSongChordOverride(userId, songId, chordName);
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
    if (!this.dataProvider) {
      console.error('[ChordResolution] No data provider set');
      return [];
    }

    const variations: ResolvedChord[] = [];

    // Get user custom chords
    const userChords = await this.dataProvider.getUserCustomChords(userId, chordName, instrumentId);
    variations.push(
      ...userChords.map((c) => this.mapLocalFingeringToResolved(c, 'user-custom'))
    );

    // Get system override
    const systemChord = await this.dataProvider.getSystemOverrideChord(chordName, instrumentId);
    if (systemChord) {
      variations.push(this.mapSystemChordToResolved(systemChord, 'system-override'));
    }

    // Get dynamic chord
    const dynamicChord = await this.dataProvider.getDynamicChord(chordName, instrumentId);
    if (dynamicChord) {
      variations.push(dynamicChord);
    }

    return variations;
  }

  // ==========================================================================
  // Private: Specific variation resolution
  // ==========================================================================

  /**
   * Resolve a specific variation based on source and ID
   */
  private async resolveSpecificVariation(
    _userId: string,
    chordName: string,
    instrumentId: string,
    source: 'user-custom' | 'system-override' | 'dynamic',
    variationId?: string
  ): Promise<ResolvedChord | null> {
    if (!this.dataProvider) return null;

    switch (source) {
      case 'user-custom': {
        if (!variationId) return null;
        const userChord = await this.dataProvider.getUserCustomChordById(variationId);
        return userChord ? this.mapLocalFingeringToResolved(userChord, 'user-custom') : null;
      }
      case 'system-override': {
        const systemChord = await this.dataProvider.getSystemOverrideChord(chordName, instrumentId);
        return systemChord
          ? this.mapSystemChordToResolved(systemChord, 'system-override')
          : null;
      }
      case 'dynamic': {
        return this.dataProvider.getDynamicChord(chordName, instrumentId);
      }
      default:
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
