<script lang="ts">
  import { browser } from '$app/environment';
  import type { CustomInstrument, Instrument } from '@gigwidget/core';
  import { INSTRUMENTS } from '@gigwidget/core';
  import { isAuthenticated } from '$lib/stores/authStore.svelte';
  import { syncCustomInstrumentToCloud, deleteCustomInstrumentFromCloud } from '$lib/stores/syncStore.svelte';

  let instruments = $state<CustomInstrument[]>([]);
  let loading = $state(true);
  let hasLoaded = false;
  let showCreateModal = $state(false);

  // Form state
  let newName = $state('');
  let newBaseType = $state<Instrument>('guitar');
  let newStrings = $state('E2,A2,D3,G3,B3,E4');
  let newFrets = $state(22);
  let newIsPublic = $state(false);
  let creating = $state(false);
  let formError = $state<string | null>(null);

  // Common tunings
  const COMMON_TUNINGS: Record<string, { name: string; strings: string }[]> = {
    guitar: [
      { name: 'Standard', strings: 'E2,A2,D3,G3,B3,E4' },
      { name: 'Drop D', strings: 'D2,A2,D3,G3,B3,E4' },
      { name: 'Open G', strings: 'D2,G2,D3,G3,B3,D4' },
      { name: 'DADGAD', strings: 'D2,A2,D3,G3,A3,D4' },
      { name: 'Open D', strings: 'D2,A2,D3,F#3,A3,D4' },
    ],
    bass: [
      { name: 'Standard 4-string', strings: 'E1,A1,D2,G2' },
      { name: 'Standard 5-string', strings: 'B0,E1,A1,D2,G2' },
      { name: 'Drop D', strings: 'D1,A1,D2,G2' },
    ],
    ukulele: [
      { name: 'Standard (GCEA)', strings: 'G4,C4,E4,A4' },
      { name: 'Baritone (DGBE)', strings: 'D3,G3,B3,E4' },
    ],
    banjo: [
      { name: 'Standard 5-string', strings: 'G4,D3,G3,B3,D4' },
      { name: 'Open G', strings: 'G4,D3,G3,B3,D4' },
    ],
    mandolin: [{ name: 'Standard', strings: 'G3,D4,A4,E5' }],
  };

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadInstruments();
  });

  async function loadInstruments() {
    try {
      const { CustomInstrumentRepository, getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      const users = await db.users.toArray();
      if (users.length > 0) {
        instruments = await CustomInstrumentRepository.getByUser(users[0].id);
      }
    } catch (err) {
      console.error('Failed to load instruments:', err);
    } finally {
      loading = false;
    }
  }

  function selectTuning(tuning: { name: string; strings: string }) {
    newStrings = tuning.strings;
  }

  async function createInstrument() {
    formError = null;

    if (!newName.trim()) {
      formError = 'Name is required';
      return;
    }

    const stringsArray = newStrings.split(',').map((s) => s.trim());
    if (stringsArray.length < 1 || stringsArray.some((s) => !s)) {
      formError = 'Invalid string tuning format';
      return;
    }

    creating = true;
    try {
      const { CustomInstrumentRepository, getDatabase } = await import('@gigwidget/db');
      const { generateId } = await import('@gigwidget/core');
      const db = getDatabase();

      const users = await db.users.toArray();
      if (users.length === 0) return;

      const newInstrument: CustomInstrument = {
        id: generateId(),
        userId: users[0].id,
        name: newName.trim(),
        baseType: newBaseType,
        strings: stringsArray,
        frets: newFrets,
        isPublic: newIsPublic,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await CustomInstrumentRepository.create(newInstrument);
      instruments = [...instruments, newInstrument];

      // Sync to cloud if authenticated
      if (isAuthenticated()) {
        syncCustomInstrumentToCloud(newInstrument);
      }

      // Reset form
      newName = '';
      newBaseType = 'guitar';
      newStrings = 'E2,A2,D3,G3,B3,E4';
      newFrets = 22;
      newIsPublic = false;
      showCreateModal = false;
    } catch (err) {
      console.error('Failed to create instrument:', err);
      formError = 'Failed to create instrument';
    } finally {
      creating = false;
    }
  }

  async function deleteInstrument(id: string) {
    if (!confirm('Delete this instrument? Your fingerings for it will also be deleted.')) return;

    try {
      const { CustomInstrumentRepository } = await import('@gigwidget/db');
      await CustomInstrumentRepository.delete(id);
      instruments = instruments.filter((i) => i.id !== id);

      // Delete from cloud if authenticated
      if (isAuthenticated()) {
        deleteCustomInstrumentFromCloud(id);
      }
    } catch (err) {
      console.error('Failed to delete instrument:', err);
    }
  }

  function formatStrings(strings: string[]): string {
    return strings.join(' - ');
  }
</script>

<svelte:head>
  <title>Custom Instruments - Gigwidget</title>
</svelte:head>

<main class="container">
  <header class="page-header">
    <div class="header-left">
      <a href="/" class="back-link">← Home</a>
      <h1>Custom Instruments</h1>
      <p class="subtitle">Create instruments with custom tunings for chord diagrams</p>
    </div>
    <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>+ New Instrument</button>
  </header>

  {#if loading}
    <div class="loading">Loading instruments...</div>
  {:else if instruments.length === 0}
    <div class="empty-state">
      <p>No custom instruments yet. Create one to use custom tunings in your chord diagrams!</p>
      <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>Create Instrument</button>
    </div>
  {:else}
    <div class="instruments-grid">
      {#each instruments as instrument (instrument.id)}
        <div class="instrument-card">
          <div class="instrument-header">
            <h3 class="instrument-name">{instrument.name}</h3>
            <span class="base-type">{instrument.baseType}</span>
          </div>
          <div class="instrument-details">
            <div class="detail-row">
              <span class="detail-label">Tuning:</span>
              <span class="detail-value tuning">{formatStrings(instrument.strings)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Frets:</span>
              <span class="detail-value">{instrument.frets}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Strings:</span>
              <span class="detail-value">{instrument.strings.length}</span>
            </div>
          </div>
          {#if instrument.isPublic}
            <span class="public-badge">Shared in sessions</span>
          {/if}
          <div class="instrument-actions">
            <button class="btn btn-danger btn-sm" onclick={() => deleteInstrument(instrument.id)}>
              Delete
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</main>

{#if showCreateModal}
  <div class="modal-overlay" onclick={() => (showCreateModal = false)}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Create Custom Instrument</h2>

      {#if formError}
        <div class="error-message">{formError}</div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); createInstrument(); }}>
        <div class="form-group">
          <label for="instrument-name">Name *</label>
          <input
            type="text"
            id="instrument-name"
            bind:value={newName}
            placeholder="e.g., Drop D Guitar, 7-String"
            required
            disabled={creating}
          />
        </div>

        <div class="form-group">
          <label for="base-type">Base Instrument</label>
          <select id="base-type" bind:value={newBaseType} disabled={creating}>
            {#each INSTRUMENTS as inst}
              <option value={inst}>{inst.charAt(0).toUpperCase() + inst.slice(1)}</option>
            {/each}
          </select>
        </div>

        {#if COMMON_TUNINGS[newBaseType]}
          <div class="form-group">
            <label>Quick Tunings</label>
            <div class="tuning-buttons">
              {#each COMMON_TUNINGS[newBaseType] as tuning}
                <button
                  type="button"
                  class="tuning-btn"
                  class:active={newStrings === tuning.strings}
                  onclick={() => selectTuning(tuning)}
                  disabled={creating}
                >
                  {tuning.name}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <div class="form-group">
          <label for="strings">String Tuning (comma-separated, low to high) *</label>
          <input
            type="text"
            id="strings"
            bind:value={newStrings}
            placeholder="E2,A2,D3,G3,B3,E4"
            required
            disabled={creating}
          />
          <span class="help-text">Use note names with octave numbers (e.g., E2, A2, D3)</span>
        </div>

        <div class="form-group">
          <label for="frets">Number of Frets</label>
          <input
            type="number"
            id="frets"
            bind:value={newFrets}
            min="12"
            max="30"
            disabled={creating}
          />
        </div>

        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" bind:checked={newIsPublic} disabled={creating} />
            Share in P2P sessions (others can use this instrument temporarily)
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick={() => (showCreateModal = false)} disabled={creating}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={creating || !newName.trim()}>
            {creating ? 'Creating...' : 'Create Instrument'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: var(--spacing-lg) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .back-link {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  .subtitle {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-xl);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    margin-top: var(--spacing-xl);
  }

  .empty-state p {
    color: var(--color-text-muted);
  }

  .instruments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--spacing-md);
    padding: var(--spacing-lg) 0;
  }

  .instrument-card {
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .instrument-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .instrument-name {
    font-size: 1.1rem;
    font-weight: 500;
    margin: 0;
  }

  .base-type {
    background-color: var(--color-surface);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    text-transform: capitalize;
  }

  .instrument-details {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .detail-row {
    display: flex;
    gap: var(--spacing-sm);
    font-size: 0.875rem;
  }

  .detail-label {
    color: var(--color-text-muted);
  }

  .detail-value.tuning {
    font-family: monospace;
    font-size: 0.8rem;
  }

  .public-badge {
    display: inline-block;
    background-color: var(--color-secondary);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    width: fit-content;
  }

  .instrument-actions {
    margin-top: var(--spacing-sm);
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.75rem;
  }

  .btn-danger {
    background-color: transparent;
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
  }

  .btn-danger:hover {
    background-color: var(--color-primary);
    color: white;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--spacing-md);
  }

  .modal {
    background-color: var(--color-bg);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal h2 {
    margin: 0 0 var(--spacing-lg);
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
    font-size: 0.875rem;
  }

  .form-group {
    margin-bottom: var(--spacing-md);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--spacing-xs);
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .help-text {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: var(--spacing-xs);
  }

  .tuning-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .tuning-btn {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tuning-btn:hover {
    background-color: var(--color-surface);
  }

  .tuning-btn.active {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }

  .checkbox-group input[type='checkbox'] {
    width: auto;
  }

  select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23a0a0a0' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--spacing-md) center;
    padding-right: 2.5rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
  }
</style>
