<script lang="ts">
  import { browser } from '$app/environment';
  import type { LocalFingering, CustomInstrument } from '@gigwidget/core';

  interface Props {
    chordName: string;
    instrumentId?: string;
    onFingeringSelect?: (fingering: LocalFingering) => void;
    onCreateNew?: () => void;
  }

  let { chordName, instrumentId, onFingeringSelect, onCreateNew }: Props = $props();

  let fingerings = $state<LocalFingering[]>([]);
  let defaultFingering = $state<LocalFingering | null>(null);
  let instrument = $state<CustomInstrument | null>(null);
  let loading = $state(true);
  let componentReady = $state(false);
  let hasLoaded = false;

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;

    loadChordComponent();
    loadFingerings();
  });

  // Reload when chord name changes
  $effect(() => {
    if (browser && hasLoaded && chordName) {
      loadFingerings();
    }
  });

  async function loadChordComponent() {
    try {
      await import('@parent-tobias/chord-component');
      componentReady = true;
    } catch (err) {
      console.error('Failed to load chord-component:', err);
    }
  }

  async function loadFingerings() {
    loading = true;
    try {
      const { LocalFingeringRepository, CustomInstrumentRepository, getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      const users = await db.users.toArray();
      if (users.length === 0) {
        loading = false;
        return;
      }

      const userId = users[0].id;
      const targetInstrumentId = instrumentId || 'guitar';

      // Load custom instrument if specified
      if (instrumentId) {
        instrument = await CustomInstrumentRepository.getById(instrumentId);
      }

      // Load all fingerings for this chord and instrument
      fingerings = await LocalFingeringRepository.getByChord(userId, chordName, targetInstrumentId);

      // Get default fingering
      defaultFingering = await LocalFingeringRepository.getDefault(userId, chordName, targetInstrumentId);
    } catch (err) {
      console.error('Failed to load fingerings:', err);
    } finally {
      loading = false;
    }
  }

  async function setAsDefault(fingering: LocalFingering) {
    try {
      const { LocalFingeringRepository } = await import('@gigwidget/db');
      await LocalFingeringRepository.setDefault(fingering.id);
      defaultFingering = fingering;

      // Update the fingerings list
      fingerings = fingerings.map((f) => ({
        ...f,
        isDefault: f.id === fingering.id,
      }));

      onFingeringSelect?.(fingering);
    } catch (err) {
      console.error('Failed to set default fingering:', err);
    }
  }

  function formatPositions(positions: number[]): string {
    return positions.map((p) => (p === -1 ? 'x' : p === 0 ? '0' : p.toString())).join(' ');
  }
</script>

<div class="chord-viewer">
  <div class="chord-header">
    <h3 class="chord-name">{chordName}</h3>
    {#if instrument}
      <span class="instrument-name">{instrument.name}</span>
    {/if}
  </div>

  {#if loading}
    <div class="loading">Loading chord...</div>
  {:else}
    <div class="fingerings-section">
      {#if fingerings.length === 0}
        <p class="no-fingerings">No saved fingerings for this chord.</p>
      {:else}
        <div class="fingerings-list">
          {#each fingerings as fingering (fingering.id)}
            <button
              type="button"
              class="fingering-card"
              class:default={fingering.isDefault}
              onclick={() => setAsDefault(fingering)}
            >
              {#if componentReady}
                <chord-diagram
                  chord={JSON.stringify({
                    positions: fingering.positions,
                    fingers: fingering.fingers,
                    barres: fingering.barres,
                    baseFret: fingering.baseFret,
                  })}
                  size="small"
                ></chord-diagram>
              {:else}
                <div class="positions-text">{formatPositions(fingering.positions)}</div>
              {/if}
              {#if fingering.isDefault}
                <span class="default-badge">Default</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      {#if onCreateNew}
        <button type="button" class="btn btn-secondary create-btn" onclick={onCreateNew}>
          + Create New Fingering
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

  .no-fingerings {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--spacing-md);
  }

  .fingerings-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
  }

  .fingering-card {
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
  }

  .fingering-card:hover {
    border-color: var(--color-primary);
  }

  .fingering-card.default {
    border-color: var(--color-primary);
    background-color: rgba(233, 69, 96, 0.1);
  }

  .positions-text {
    font-family: monospace;
    font-size: 0.875rem;
    padding: var(--spacing-sm);
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
