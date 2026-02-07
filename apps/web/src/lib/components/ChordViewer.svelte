<script lang="ts">
  import { browser } from '$app/environment';
  import type { ResolvedChord } from '@gigwidget/core';
  import { registerCustomInstruments } from '$lib/services/chordResolution';

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
    chordName: string;
    instrumentId?: string;
    onChordSelect?: (chord: ResolvedChord) => void;
    onCreateNew?: () => void;
  }

  let { chordName, instrumentId, onChordSelect, onCreateNew }: Props = $props();

  let chordComponentInstrument = $derived(getChordComponentId(instrumentId || 'ukulele'));

  let chordVariations = $state<ResolvedChord[]>([]);
  let selectedChord = $state<ResolvedChord | null>(null);
  let loading = $state(true);
  let componentReady = $state(false);
  let hasLoaded = false;

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;

    loadChordComponent();
    loadChordVariations();
  });

  // Reload when chord name or instrument changes
  $effect(() => {
    if (browser && hasLoaded && (chordName || instrumentId)) {
      loadChordVariations();
    }
  });

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

  async function loadChordVariations() {
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
      const targetInstrumentId = instrumentId || 'ukulele';

      // Get all variations using resolution service
      chordVariations = await getAllChordVariationsWithSystemChords(
        userId,
        chordName,
        targetInstrumentId
      );

      // Set selected to the first variation (the default priority)
      if (chordVariations.length > 0) {
        selectedChord = chordVariations[0];
        onChordSelect?.(selectedChord);
      }
    } catch (err) {
      console.error('Failed to load chord variations:', err);
    } finally {
      loading = false;
    }
  }

  function selectChord(chord: ResolvedChord) {
    selectedChord = chord;
    onChordSelect?.(chord);
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

  function formatPositions(positions: number[]): string {
    return positions.map((p) => (p === -1 ? 'x' : p === 0 ? '0' : p.toString())).join(' ');
  }
</script>

<div class="chord-viewer">
  <div class="chord-header">
    <h3 class="chord-name">{chordName}</h3>
    {#if instrumentId}
      <span class="instrument-name">{instrumentId}</span>
    {/if}
  </div>

  {#if loading}
    <div class="loading">Loading chord variations...</div>
  {:else if chordVariations.length === 0}
    <p class="no-chords">No chord data found.</p>
  {:else}
    <div class="variations-section">
      <div class="variations-list">
        {#each chordVariations as variation (variation.source + variation.baseFret)}
          <button
            type="button"
            class="variation-card"
            class:selected={selectedChord?.source === variation.source && selectedChord?.baseFret === variation.baseFret}
            onclick={() => selectChord(variation)}
          >
            {#if componentReady}
              <chord-diagram
                instrument={chordComponentInstrument}
                use:setChordData={variation}
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

            {#if variation.metadata?.isDefault}
              <span class="default-badge">Default</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if onCreateNew}
        <button type="button" class="btn btn-secondary create-btn" onclick={onCreateNew}>
          + Create Custom Fingering
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .chord-viewer {
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
  }

  .chord-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
    padding-bottom: var(--spacing-sm);
    border-bottom: 1px solid var(--color-border);
  }

  .chord-name {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .instrument-name {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    background-color: var(--color-surface);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
  }

  .loading {
    text-align: center;
    padding: var(--spacing-md);
    color: var(--color-text-muted);
  }

  .no-chords {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--spacing-md);
  }

  .variations-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .variation-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-sm);
    background-color: var(--color-surface);
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-width: 100px;
  }

  .variation-card:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
  }

  .variation-card.selected {
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
    max-width: 100px;
  }

  .creator {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    margin-top: 2px;
    margin-bottom: 0;
    text-align: center;
  }

  .default-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    background-color: var(--color-primary);
    color: white;
    font-size: 0.6rem;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
  }

  .create-btn {
    width: 100%;
  }

  chord-diagram {
    display: block;
    width: 80px;
    height: 100px;
  }
</style>
