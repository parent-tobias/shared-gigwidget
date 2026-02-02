<script lang="ts">
  import { browser } from '$app/environment';
  import type { ResolvedChord, SongChordOverride, LocalFingering } from '@gigwidget/core';
  import { generateId, hasPermission } from '@gigwidget/core';
  import ChordEditor from './ChordEditor.svelte';

  interface Props {
    songId: string;
    chordName: string;
    instrumentId: string;
    currentOverride?: SongChordOverride | null;
    onSelect: (source: ResolvedChord['source'], variationId?: string) => void;
    onReset: () => void;
    onClose: () => void;
  }

  let { songId, chordName, instrumentId, currentOverride, onSelect, onReset, onClose }: Props =
    $props();

  let chordVariations = $state<ResolvedChord[]>([]);
  let loading = $state(true);
  let componentReady = $state(false);
  let showEditor = $state(false);
  let user = $state<any>(null);
  let canEditChords = $derived(user && hasPermission(user, 'edit_chords'));

  $effect(() => {
    if (browser) {
      loadChordComponent();
      loadUser();
      loadVariations();
    }
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
      await import('@parent-tobias/chord-component');
      componentReady = true;
    } catch (err) {
      console.error('Failed to load chord-component:', err);
    }
  }

  async function loadVariations() {
    loading = true;
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const { getAllChordVariationsWithSystemChords } = await import('$lib/services/chordResolution');

      const db = getDatabase();
      const users = await db.users.toArray();

      if (users.length === 0) {
        loading = false;
        return;
      }

      const userId = users[0].id;

      chordVariations = await getAllChordVariationsWithSystemChords(
        userId,
        chordName,
        instrumentId
      );
    } catch (err) {
      console.error('Failed to load chord variations:', err);
    } finally {
      loading = false;
    }
  }

  function handleSelect(variation: ResolvedChord) {
    // Determine variation ID based on source
    let variationId: string | undefined;

    if (variation.source === 'user-custom' || variation.source === 'system-override') {
      // For user-custom and system-override, we'd need the actual ID
      // For now, we'll pass undefined and let the caller figure it out
      variationId = undefined;
    }

    onSelect(variation.source, variationId);
  }

  function handleCreateCustom() {
    showEditor = true;
  }

  function handleEditorSave(fingering: LocalFingering) {
    // After saving, reload variations and return to list view
    showEditor = false;
    loadVariations();
  }

  function handleEditorCancel() {
    showEditor = false;
  }

  function getSourceBadgeClass(source: ResolvedChord['source']): string {
    switch (source) {
      case 'user-custom': return 'badge-user';
      case 'system-override': return 'badge-system';
      case 'dynamic': return 'badge-dynamic';
      case 'song-override': return 'badge-song';
    }
  }

  function getSourceLabel(source: ResolvedChord['source']): string {
    switch (source) {
      case 'user-custom': return 'Your Custom';
      case 'system-override': return 'System Override';
      case 'dynamic': return 'Generated';
      case 'song-override': return 'Song Override';
    }
  }

  function isCurrentlySelected(variation: ResolvedChord): boolean {
    if (!currentOverride) return false;
    return currentOverride.selectedSource === variation.source;
  }

  function formatPositions(positions: number[]): string {
    return positions.map((p) => (p === -1 ? 'x' : p === 0 ? '0' : p.toString())).join(' ');
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
  <div class="modal-content">
    <div class="modal-header">
      <h2>{showEditor ? 'Create Custom Fingering' : 'Choose Chord Variation'}: {chordName}</h2>
      <button type="button" class="close-btn" onclick={onClose}>×</button>
    </div>

    {#if showEditor}
      <div class="modal-body">
        <ChordEditor
          chordName={chordName}
          instrumentId={instrumentId}
          onSave={handleEditorSave}
          onCancel={handleEditorCancel}
        />
      </div>
    {:else if loading}
      <div class="loading">Loading chord variations...</div>
    {:else if chordVariations.length === 0}
      <div class="modal-body">
        <p class="no-variations">No chord variations found.</p>
        {#if canEditChords}
          <div class="create-section">
            <button type="button" class="btn btn-primary" onclick={handleCreateCustom}>
              Create New Custom Fingering
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <div class="modal-body">
        <p class="instructions">
          Select which version of this chord to use for this song. Your choice will only affect
          this song.
        </p>

        <div class="variations-grid">
          {#each chordVariations as variation (variation.source + variation.baseFret)}
            <button
              type="button"
              class="variation-option"
              class:selected={isCurrentlySelected(variation)}
              onclick={() => handleSelect(variation)}
            >
              {#if componentReady}
                <chord-diagram
                  chord={JSON.stringify({
                    positions: variation.positions,
                    fingers: variation.fingers,
                    barres: variation.barres,
                    baseFret: variation.baseFret,
                  })}
                  size="medium"
                ></chord-diagram>
              {:else}
                <div class="positions-text">{formatPositions(variation.positions)}</div>
              {/if}

              <span class="source-badge {getSourceBadgeClass(variation.source)}">
                {getSourceLabel(variation.source)}
              </span>

              {#if variation.metadata?.description}
                <p class="description">{variation.metadata.description}</p>
              {/if}

              {#if variation.metadata?.createdByName}
                <p class="creator">by {variation.metadata.createdByName}</p>
              {/if}

              {#if isCurrentlySelected(variation)}
                <div class="selected-indicator">✓ Currently Selected</div>
              {/if}
            </button>
          {/each}
        </div>

        {#if canEditChords}
          <div class="create-section">
            <button type="button" class="btn btn-primary" onclick={handleCreateCustom}>
              Create New Custom Fingering
            </button>
          </div>
        {/if}

        {#if currentOverride}
          <div class="reset-section">
            <button type="button" class="btn btn-secondary" onclick={onReset}>
              Reset to Default Priority
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--spacing-md);
  }

  .modal-content {
    background-color: var(--color-bg);
    border-radius: var(--radius-lg);
    max-width: 800px;
    width: 100%;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 2rem;
    color: var(--color-text-muted);
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--color-text);
  }

  .modal-body {
    padding: var(--spacing-lg);
    overflow-y: auto;
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .no-variations {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .instructions {
    margin-bottom: var(--spacing-lg);
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .variations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
  }

  @media (max-width: 600px) {
    .variations-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }

  .variation-option {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-md);
    background-color: var(--color-surface);
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .variation-option:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .variation-option.selected {
    border-color: var(--color-primary);
    background-color: rgba(233, 69, 96, 0.1);
  }

  .positions-text {
    font-family: monospace;
    font-size: 0.875rem;
    padding: var(--spacing-sm);
  }

  .source-badge {
    font-size: 0.65rem;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
    margin-top: 4px;
  }

  .badge-user {
    background-color: var(--color-primary);
    color: white;
  }

  .badge-system {
    background-color: #4CAF50;
    color: white;
  }

  .badge-dynamic {
    background-color: #757575;
    color: white;
  }

  .badge-song {
    background-color: #9C27B0;
    color: white;
  }

  .description {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 4px;
    margin-bottom: 0;
    font-style: italic;
    text-align: center;
  }

  .creator {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    margin-top: 2px;
    margin-bottom: 0;
    text-align: center;
  }

  .selected-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
    background-color: var(--color-primary);
    color: white;
    font-size: 0.65rem;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }

  .reset-section {
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: center;
  }

  .create-section {
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: center;
    margin-top: var(--spacing-md);
  }

  chord-diagram {
    display: block;
    width: 100px;
    height: 120px;
  }
</style>
