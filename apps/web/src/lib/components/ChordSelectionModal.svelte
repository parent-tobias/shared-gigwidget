<script lang="ts">
  import { browser } from '$app/environment';
  import type { ResolvedChord, SongChordOverride, LocalFingering } from '@gigwidget/core';
  import { hasPermission } from '@gigwidget/core';
  import { registerCustomInstruments } from '$lib/services/chordResolution';
  import ChordEditor from './ChordEditor.svelte';

  // Map app instrument IDs to chord-component v2 IDs
  const CHORD_COMPONENT_IDS: Record<string, string> = {
    'drop-d-guitar': 'guitar-drop-d',
    '5ths-ukulele': 'ukulele-5ths',
  };

  function getChordComponentId(id: string): string {
    return CHORD_COMPONENT_IDS[id] || id;
  }

  // Svelte action: set chordFingers/chordBarres JS properties on <chord-diagram>
  function setChordData(node: HTMLElement, variation: ResolvedChord) {
    function update(v: ResolvedChord) {
      const fingers = v.positions.map((fret, i) =>
        fret === -1 ? [i + 1, 'x'] : [i + 1, fret]
      );
      (node as any).chordFingers = fingers;
      (node as any).chordBarres = v.barres || [];
    }
    update(variation);
    return { update };
  }

  interface Props {
    songId: string;
    chordName: string;
    instrumentId: string;
    currentOverride?: SongChordOverride | null;
    onSelect: (source: ResolvedChord['source'], variationId?: string) => void;
    onReset: () => void;
    onClose: () => void;
  }

  let { songId: _songId, chordName, instrumentId, currentOverride, onSelect, onReset, onClose }: Props =
    $props();

  // Extended variation type that includes ID for user chords
  interface VariationWithId extends ResolvedChord {
    id?: string;
  }

  let chordVariations = $state<VariationWithId[]>([]);
  let loading = $state(true);
  let componentReady = $state(false);
  let showEditor = $state(false);
  let user = $state<any>(null);
  let canEditChords = $derived(user && hasPermission(user, 'edit_chords'));
  let deletingId = $state<string | null>(null);

  let chordComponentInstrument = $derived(getChordComponentId(instrumentId));

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
      if (customElements.get('chord-diagram')) {
        await registerCustomInstruments();
        componentReady = true;
        return;
      }

      await import('@parent-tobias/chord-component');
      await registerCustomInstruments();
      componentReady = true;
    } catch (err) {
      console.error('Failed to load chord-component:', err);
      if (err instanceof DOMException && err.message.includes('already been defined')) {
        await registerCustomInstruments();
        componentReady = true;
      }
    }
  }

  async function loadVariations() {
    loading = true;
    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      const { getAllChordVariationsWithSystemChords } = await import('$lib/services/chordResolution');

      if (!user) {
        loading = false;
        return;
      }

      const userId = user.id;

      // Get variations from resolution service
      const variations = await getAllChordVariationsWithSystemChords(
        userId,
        chordName,
        instrumentId
      );

      // For user-custom variations, we need to get the IDs
      // Query user's local fingerings to match them up
      const userFingerings = await LocalFingeringRepository.getByUserAndChord(
        userId,
        chordName,
        instrumentId
      );

      // Create a map of user fingerings by their position signature
      const userFingeringMap = new Map<string, LocalFingering>();
      for (const f of userFingerings) {
        const sig = f.positions.join(',') + ':' + f.baseFret;
        userFingeringMap.set(sig, f);
      }

      // Augment variations with IDs where possible
      chordVariations = variations.map((v) => {
        if (v.source === 'user-custom') {
          const sig = v.positions.join(',') + ':' + v.baseFret;
          const matched = userFingeringMap.get(sig);
          return { ...v, id: matched?.id };
        }
        return v;
      });
    } catch (err) {
      console.error('Failed to load chord variations:', err);
    } finally {
      loading = false;
    }
  }

  function handleSelect(variation: VariationWithId) {
    onSelect(variation.source, variation.id);
  }

  function handleCreateCustom() {
    showEditor = true;
  }

  function handleEditorSave(_fingering: LocalFingering) {
    showEditor = false;
    loadVariations();
  }

  function handleEditorCancel() {
    showEditor = false;
  }

  async function handleDeleteUserChord(variation: VariationWithId, e: MouseEvent) {
    e.stopPropagation(); // Don't trigger selection

    if (!variation.id) {
      console.error('No ID for user chord to delete');
      return;
    }

    if (!confirm('Delete this custom chord fingering?')) {
      return;
    }

    deletingId = variation.id;
    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      await LocalFingeringRepository.delete(variation.id);
      await loadVariations();
    } catch (err) {
      console.error('Failed to delete user chord:', err);
    } finally {
      deletingId = null;
    }
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
          {#each chordVariations as variation (variation.source + variation.baseFret + (variation.id || ''))}
            <div class="variation-card">
              <button
                type="button"
                class="variation-option"
                class:selected={isCurrentlySelected(variation)}
                onclick={() => handleSelect(variation)}
              >
                {#if componentReady}
                  <div class="diagram-container">
                    <chord-diagram
                      instrument={chordComponentInstrument}
                      use:setChordData={variation}
                    ></chord-diagram>
                  </div>
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
                  <div class="selected-indicator">✓ Selected</div>
                {/if}
              </button>

              {#if variation.source === 'user-custom' && variation.id && canEditChords}
                <button
                  type="button"
                  class="delete-btn"
                  onclick={(e) => handleDeleteUserChord(variation, e)}
                  disabled={deletingId === variation.id}
                  title="Delete this custom fingering"
                >
                  {deletingId === variation.id ? '...' : '×'}
                </button>
              {/if}
            </div>
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
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
  }

  @media (max-width: 600px) {
    .variations-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }

  .variation-card {
    position: relative;
  }

  .variation-option {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-md);
    padding-top: var(--spacing-lg);
    background-color: var(--color-surface);
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    width: 100%;
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

  .diagram-container {
    width: 100px;
    height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .diagram-container :global(svg) {
    max-width: 100%;
    max-height: 100%;
  }

  chord-diagram {
    display: block;
    width: 100px;
    height: 110px;
    --chord-diagram-color: var(--color-text, #e2e8f0);
    --chord-bg: transparent;
    --chord-border: transparent;
    --chord-name-color: var(--color-text, #e2e8f0);
  }

  .positions-text {
    font-family: monospace;
    font-size: 0.875rem;
    padding: var(--spacing-sm);
    height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
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
    top: 4px;
    left: 4px;
    background-color: var(--color-primary);
    color: white;
    font-size: 0.6rem;
    padding: 2px 4px;
    border-radius: 4px;
    font-weight: 600;
  }

  .delete-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background-color: rgba(244, 67, 54, 0.8);
    color: white;
    border-radius: 50%;
    font-size: 0.875rem;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    transition: all var(--transition-fast);
    z-index: 1;
  }

  .delete-btn:hover:not(:disabled) {
    background-color: #f44336;
    transform: scale(1.1);
  }

  .delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
</style>
