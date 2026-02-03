<script lang="ts">
  import { browser } from '$app/environment';
  import type { LocalFingering } from '@gigwidget/core';

  // Map our instrument IDs to chord-component's expected names and string counts
  const INSTRUMENT_CONFIG: Record<string, { name: string; strings: number }> = {
    'guitar': { name: 'Standard Guitar', strings: 6 },
    'ukulele': { name: 'Standard Ukulele', strings: 4 },
    'baritone-ukulele': { name: 'Baritone Ukulele', strings: 4 },
    'mandolin': { name: 'Standard Mandolin', strings: 4 },
    'drop-d-guitar': { name: 'Drop-D Guitar', strings: 6 },
    '5ths-ukulele': { name: '5ths tuned Ukulele', strings: 4 },
  };

  function getChordComponentInstrumentName(instrumentId: string): string {
    return INSTRUMENT_CONFIG[instrumentId]?.name || instrumentId;
  }

  function getStringCount(instrumentId: string): number {
    return INSTRUMENT_CONFIG[instrumentId]?.strings || 4;
  }

  // Convert chord-component's sparse fingers format to our dense positions format
  // chord-component: fingers = [[string, fret], ...] (1-indexed strings)
  // our format: positions = [fret, fret, ...] (one per string, 0-indexed)
  function convertChordComponentToPositions(
    fingers: [number, number][],
    numStrings: number
  ): number[] {
    // Initialize all strings as muted (-1)
    const positions = new Array(numStrings).fill(-1);

    for (const [stringNum, fret] of fingers) {
      // chord-component uses 1-indexed strings
      const index = stringNum - 1;
      if (index >= 0 && index < numStrings) {
        positions[index] = fret;
      }
    }

    return positions;
  }

  interface Props {
    chordName: string;
    instrumentId?: string;
    existingFingering?: LocalFingering;
    onSave?: (fingering: LocalFingering) => void;
    onCancel?: () => void;
  }

  let { chordName, instrumentId, existingFingering, onSave, onCancel }: Props = $props();

  // Get the chord-component compatible instrument name
  let chordComponentInstrument = $derived(getChordComponentInstrumentName(instrumentId || 'guitar'));

  // Form state - provide default structure for new chords
  let chordData = $state<any>(
    existingFingering
      ? {
          positions: existingFingering.positions,
          fingers: existingFingering.fingers,
          barres: existingFingering.barres,
          baseFret: existingFingering.baseFret,
        }
      : {
          positions: [],
          fingers: [],
          barres: [],
          baseFret: 1,
        }
  );
  let saving = $state(false);
  let error = $state<string | null>(null);
  let componentReady = $state(false);
  let user = $state<any>(null);
  let hasLoaded = false;

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;

    loadUser();
    loadChordComponent();
  });

  async function loadUser() {
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const users = await db.users.toArray();
      if (users.length > 0) {
        user = users[0];
      }
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  }

  async function loadChordComponent() {
    try {
      // Check if custom elements are already defined
      if (customElements.get('chord-editor')) {
        componentReady = true;
        return;
      }

      await import('@parent-tobias/chord-component');
      componentReady = true;
    } catch (err) {
      console.error('Failed to load chord-component:', err);
      // If error is about already defined, component is still ready
      if (err instanceof DOMException && err.message.includes('already been defined')) {
        componentReady = true;
      }
    }
  }

  async function saveFingering() {
    console.log('[ChordEditor] saveFingering called - button was clicked!');

    if (!user) {
      console.log('[ChordEditor] No user found, aborting');
      error = 'No user found';
      return;
    }

    console.log('[ChordEditor] Starting save process');
    error = null;
    saving = true;

    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      const { generateId } = await import('@gigwidget/core');

      // Import indexedDBService, ignoring custom element re-registration errors
      let indexedDBService;
      try {
        const chordComponent = await import('@parent-tobias/chord-component');
        indexedDBService = chordComponent.indexedDBService;
      } catch (importErr) {
        // Ignore "already defined" errors from custom elements
        if (importErr instanceof DOMException && importErr.message.includes('already been defined')) {
          const chordComponent = await import('@parent-tobias/chord-component');
          indexedDBService = chordComponent.indexedDBService;
        } else {
          throw importErr;
        }
      }

      const userId = user.id;

      // Retrieve current chord data from chord-component's IndexedDB
      // Key is instrument:chordName (no userId)
      console.log('[ChordEditor] Retrieving chord:', { instrument: chordComponentInstrument, chordName });
      const currentChord = await indexedDBService.getUserChord(chordComponentInstrument, chordName);
      console.log('[ChordEditor] Retrieved chord data:', currentChord);

      if (!currentChord || !currentChord.fingers || currentChord.fingers.length === 0) {
        error = 'No chord data to save. Please create a chord first.';
        saving = false;
        return;
      }

      // Convert chord-component format to our format
      const targetInstrumentId = instrumentId || 'guitar';
      const numStrings = getStringCount(targetInstrumentId);
      const positions = convertChordComponentToPositions(currentChord.fingers, numStrings);

      const fingering: LocalFingering = {
        id: existingFingering?.id ?? generateId(),
        userId,
        chordName,
        instrumentId: targetInstrumentId,
        positions,
        // Note: chord-component's "fingers" is [string, fret] pairs, not finger numbers
        // We don't have finger number data from chord-component, so omit it
        fingers: undefined,
        barres: currentChord.barres ? currentChord.barres.map((b: any) => ({ ...b })) : undefined,
        baseFret: currentChord.position || 1, // chord-component uses "position" (singular)
        isDefault: existingFingering?.isDefault ?? false,
        createdAt: existingFingering?.createdAt ?? new Date(),
      };

      if (existingFingering) {
        await LocalFingeringRepository.update(fingering.id, fingering);
        console.log('[ChordEditor] Updated fingering:', fingering);
      } else {
        await LocalFingeringRepository.create(fingering);
        console.log('[ChordEditor] Created fingering:', fingering);
      }

      onSave?.(fingering);
    } catch (err) {
      console.error('Failed to save fingering:', err);
      error = 'Failed to save fingering';
    } finally {
      saving = false;
    }
  }
</script>

<div class="chord-editor">
  <div class="editor-header">
    <h3>Edit Fingering: {chordName}</h3>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="editor-content">
    {#if !user}
      <div class="loading">Loading user...</div>
    {:else if !componentReady}
      <div class="loading">Loading chord editor...</div>
    {:else}
      <chord-editor
        chord={chordName}
        instrument={chordComponentInstrument}
        user-id={user.id}
      ></chord-editor>
    {/if}
  </div>

  <div class="editor-actions">
    {#if onCancel}
      <button type="button" class="btn btn-secondary" onclick={onCancel} disabled={saving}>
        Cancel
      </button>
    {/if}
    <button type="button" class="btn btn-primary" onclick={saveFingering} disabled={saving || !chordData}>
      {saving ? 'Saving...' : 'Save Fingering'}
    </button>
  </div>
</div>

<style>
  .chord-editor {
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-lg);
  }

  .editor-header h3 {
    margin: 0;
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .editor-content {
    min-height: 400px;
  }

  .editor-content:has(.loading) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading {
    color: var(--color-text-muted);
  }

  chord-editor {
    display: block;
    width: 100%;
    min-height: 400px;
  }

  .editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }
</style>
