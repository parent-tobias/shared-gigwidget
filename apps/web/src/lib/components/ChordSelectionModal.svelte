<script lang="ts">
  import { browser } from '$app/environment';
  import type { ResolvedChord, SongChordOverride, LocalFingering } from '@gigwidget/core';
  import { hasPermission } from '@gigwidget/core';
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

  let { songId: _songId, chordName, instrumentId, currentOverride, onSelect, onReset, onClose }: Props =
    $props();

  // Extended variation type that includes ID for user chords
  interface VariationWithId extends ResolvedChord {
    id?: string;
  }

  let chordVariations = $state<VariationWithId[]>([]);
  let loading = $state(true);
  let svguitarReady = $state(false);
  let showEditor = $state(false);
  let user = $state<any>(null);
  let canEditChords = $derived(user && hasPermission(user, 'edit_chords'));
  let deletingId = $state<string | null>(null);

  // SVGuitar reference
  let SVGuitarChord: any = null;

  // Instrument string count for SVGuitar
  const INSTRUMENT_STRINGS: Record<string, number> = {
    'guitar': 6,
    'Standard Guitar': 6,
    'ukulele': 4,
    'Standard Ukulele': 4,
    'baritone-ukulele': 4,
    'Baritone Ukulele': 4,
    'mandolin': 4,
    'Standard Mandolin': 4,
    'drop-d-guitar': 6,
    'Drop-D Guitar': 6,
    '5ths-ukulele': 4,
    '5ths tuned Ukulele': 4,
  };

  $effect(() => {
    if (browser) {
      loadSVGuitar();
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

  async function loadSVGuitar() {
    try {
      const svguitar = await import('svguitar');
      SVGuitarChord = svguitar.SVGuitarChord;
      svguitarReady = true;
    } catch (err) {
      console.error('Failed to load SVGuitar:', err);
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

  /**
   * Render a chord diagram using SVGuitar directly via use: action
   */
  function renderChordDiagram(container: HTMLElement, variation: ResolvedChord) {
    if (!SVGuitarChord || !container) return;

    container.innerHTML = '';

    const numStrings = INSTRUMENT_STRINGS[instrumentId] || 4;

    // Convert positions to fingers format for SVGuitar
    // positions is [fret, fret, ...] per string (0 = open, -1 = muted)
    const fingers: [number, number | 'x'][] = [];
    for (let i = 0; i < variation.positions.length; i++) {
      const fret = variation.positions[i];
      const stringNum = i + 1; // 1-indexed
      if (fret === -1) {
        fingers.push([stringNum, 'x']);
      } else {
        fingers.push([stringNum, fret]);
      }
    }

    try {
      const chart = new SVGuitarChord(container);
      chart
        .configure({
          strings: numStrings,
          frets: 4,
          position: variation.baseFret || 1,
          fretSize: 1.5,
          nutWidth: 10,
          sidePadding: 0.2,
          titleBottomMargin: 0,
          color: '#e2e8f0',
          backgroundColor: 'transparent',
          barreChordRadius: 0.3,
          emptyStringIndicatorSize: 0.5,
          strokeWidth: 2,
          fretLabelPosition: 'right',
          fretLabelFontSize: 38,
          fingerSize: 0.6,
          fingerTextSize: 22,
        })
        .chord({
          fingers,
          barres: variation.barres || [],
        })
        .draw();
    } catch (err) {
      console.error('Error rendering chord diagram:', err);
      container.innerHTML = '<span style="color: #fc8181; font-size: 0.75rem;">Error</span>';
    }
  }

  // Svelte action for rendering chord diagrams
  function chordDiagramAction(node: HTMLElement, variation: ResolvedChord) {
    if (svguitarReady) {
      renderChordDiagram(node, variation);
    }

    return {
      update(newVariation: ResolvedChord) {
        if (svguitarReady) {
          renderChordDiagram(node, newVariation);
        }
      }
    };
  }

  // Create a render key that changes when SVGuitar becomes ready
  // This forces Svelte to re-create the diagram elements
  let renderKey = $derived(svguitarReady ? 'ready' : 'loading');
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
                {#if svguitarReady}
                  <div class="diagram-container" use:chordDiagramAction={variation}></div>
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
