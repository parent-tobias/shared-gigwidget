<script lang="ts">
  import { browser } from '$app/environment';
  import type { LocalFingering } from '@gigwidget/core';

  interface Props {
    chordName: string;
    instrumentId?: string;
    existingFingering?: LocalFingering;
    onSave?: (fingering: LocalFingering) => void;
    onCancel?: () => void;
  }

  let { chordName, instrumentId, existingFingering, onSave, onCancel }: Props = $props();

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
    if (!user) {
      error = 'No user found';
      return;
    }

    error = null;
    saving = true;

    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      const { generateId } = await import('@gigwidget/core');
      const { indexedDBService } = await import('@parent-tobias/chord-component');

      const userId = user.id;
      const targetInstrumentId = instrumentId || 'guitar';

      // Retrieve current chord data from chord-component's IndexedDB
      console.log('[ChordEditor] Retrieving chord:', { userId, chordName, targetInstrumentId });
      const currentChord = await indexedDBService.getUserChord(userId, chordName, targetInstrumentId);
      console.log('[ChordEditor] Retrieved chord data:', currentChord);

      if (!currentChord || !currentChord.positions || currentChord.positions.length === 0) {
        error = 'No chord data to save. Please create a chord first.';
        saving = false;
        return;
      }

      // Convert to Gigwidget format
      const fingering: LocalFingering = {
        id: existingFingering?.id ?? generateId(),
        userId,
        chordName,
        instrumentId: targetInstrumentId,
        positions: [...currentChord.positions],
        fingers: currentChord.fingers ? [...currentChord.fingers] : undefined,
        barres: currentChord.barres ? currentChord.barres.map((b: any) => ({ ...b })) : undefined,
        baseFret: currentChord.baseFret || 1,
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
        chord-name={chordName}
        instrument={instrumentId || 'guitar'}
        chord={JSON.stringify(chordData)}
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
