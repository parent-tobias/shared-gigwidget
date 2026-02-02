<script lang="ts">
  import { browser } from '$app/environment';
  import { hasPermission } from '@gigwidget/core';
  import type { SupabaseSystemChord } from '$lib/stores/supabaseStore';
  import {
    loadSystemChords,
    getSystemChordsForInstrument,
  } from '$lib/stores/supabaseStore';
  import SystemChordEditor from '$lib/components/SystemChordEditor.svelte';

  // Permission check
  let user = $state<any>(null);
  let canCreateSystemChords = $derived(user && hasPermission(user, 'create_system_chords'));

  // Data state
  let systemChords = $state<SupabaseSystemChord[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Filter state
  let selectedInstrument = $state<string>('all');
  let availableInstruments = $derived.by(() => {
    const instruments = new Set(systemChords.map((c) => c.instrument_id));
    return Array.from(instruments).sort();
  });

  // Editor state
  let showEditor = $state(false);
  let editingChord = $state<SupabaseSystemChord | undefined>(undefined);
  let newChordName = $state('');
  let newInstrumentId = $state('guitar');

  // Filtered chords
  let filteredChords = $derived.by(() => {
    if (selectedInstrument === 'all') {
      return systemChords;
    }
    return systemChords.filter((c) => c.instrument_id === selectedInstrument);
  });

  $effect(() => {
    if (browser) {
      loadUser();
      loadChords();
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

  async function loadChords() {
    loading = true;
    error = null;

    try {
      const result = await loadSystemChords();

      if (result.error) {
        error = 'Failed to load system chords';
        console.error(result.error);
        return;
      }

      systemChords = result.data ?? [];
    } catch (err) {
      console.error('Exception loading system chords:', err);
      error = 'Failed to load system chords';
    } finally {
      loading = false;
    }
  }

  function handleCreateNew() {
    if (!newChordName.trim()) {
      alert('Please enter a chord name');
      return;
    }

    editingChord = undefined;
    showEditor = true;
  }

  function handleEdit(chord: SupabaseSystemChord) {
    editingChord = chord;
    newChordName = chord.chord_name;
    newInstrumentId = chord.instrument_id;
    showEditor = true;
  }

  function handleEditorSave() {
    showEditor = false;
    editingChord = undefined;
    newChordName = '';
    newInstrumentId = 'guitar';
    loadChords();
  }

  function handleEditorCancel() {
    showEditor = false;
    editingChord = undefined;
    newChordName = '';
    newInstrumentId = 'guitar';
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatPositions(positions: number[]): string {
    return positions.map((p) => (p === -1 ? 'x' : p === 0 ? '0' : p.toString())).join(' ');
  }
</script>

<div class="admin-page">
  <div class="page-header">
    <h1>System Chord Management</h1>
    <span class="mod-badge">Moderator Panel</span>
  </div>

  {#if !canCreateSystemChords}
    <div class="permission-error">
      <h3>Access Denied</h3>
      <p>You do not have permission to access this page.</p>
      <p>This feature is only available to moderators.</p>
    </div>
  {:else if showEditor}
    <div class="editor-section">
      <SystemChordEditor
        chordName={newChordName}
        instrumentId={newInstrumentId}
        existingSystemChord={editingChord}
        onSave={handleEditorSave}
        onCancel={handleEditorCancel}
      />
    </div>
  {:else}
    <div class="controls-bar">
      <div class="create-section">
        <div class="input-group">
          <input
            type="text"
            bind:value={newChordName}
            placeholder="Chord name (e.g., Am, C7, Gmaj7)"
            class="chord-name-input"
          />
          <select bind:value={newInstrumentId} class="instrument-select">
            <option value="guitar">Guitar</option>
            <option value="ukulele">Ukulele</option>
            <option value="mandolin">Mandolin</option>
            <option value="banjo">Banjo</option>
          </select>
          <button type="button" class="btn btn-primary" onclick={handleCreateNew}>
            Create New System Chord
          </button>
        </div>
      </div>

      <div class="filter-section">
        <label for="instrumentFilter">Filter by Instrument:</label>
        <select id="instrumentFilter" bind:value={selectedInstrument}>
          <option value="all">All Instruments</option>
          {#each availableInstruments as instrument}
            <option value={instrument}>{instrument}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if loading}
      <div class="loading">Loading system chords...</div>
    {:else if error}
      <div class="error-message">{error}</div>
    {:else if filteredChords.length === 0}
      <div class="no-chords">
        {#if selectedInstrument === 'all'}
          <p>No system chords have been created yet.</p>
          <p>Use the form above to create your first system chord.</p>
        {:else}
          <p>No system chords found for {selectedInstrument}.</p>
        {/if}
      </div>
    {:else}
      <div class="chords-table-container">
        <table class="chords-table">
          <thead>
            <tr>
              <th>Chord Name</th>
              <th>Instrument</th>
              <th>Positions</th>
              <th>Base Fret</th>
              <th>Description</th>
              <th>Created By</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredChords as chord (chord.id)}
              <tr>
                <td class="chord-name">{chord.chord_name}</td>
                <td>{chord.instrument_id}</td>
                <td class="positions">{formatPositions(chord.positions)}</td>
                <td>{chord.base_fret}</td>
                <td class="description">
                  {#if chord.description}
                    {chord.description}
                  {:else}
                    <span class="no-description">—</span>
                  {/if}
                </td>
                <td>{chord.created_by_name}</td>
                <td>{formatDate(chord.created_at)}</td>
                <td>{formatDate(chord.updated_at)}</td>
                <td>
                  <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    onclick={() => handleEdit(chord)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="summary">
        Showing {filteredChords.length} system chord{filteredChords.length !== 1 ? 's' : ''}
        {#if selectedInstrument !== 'all'}
          for {selectedInstrument}
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .admin-page {
    padding: var(--spacing-lg);
    max-width: 1400px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-xl);
    padding-bottom: var(--spacing-md);
    border-bottom: 2px solid var(--color-border);
  }

  .page-header h1 {
    margin: 0;
    font-size: 1.75rem;
  }

  .mod-badge {
    background-color: #4caf50;
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .permission-error {
    padding: var(--spacing-xl);
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .permission-error h3 {
    margin: 0 0 var(--spacing-sm) 0;
    color: var(--color-primary);
  }

  .editor-section {
    margin-top: var(--spacing-lg);
  }

  .controls-bar {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
    padding: var(--spacing-md);
    background-color: var(--color-surface);
    border-radius: var(--radius-md);
  }

  .create-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .input-group {
    display: flex;
    gap: var(--spacing-sm);
    align-items: stretch;
  }

  .chord-name-input {
    flex: 2;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    font-family: inherit;
  }

  .instrument-select {
    flex: 1;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    font-family: inherit;
  }

  .filter-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .filter-section label {
    font-weight: 500;
    font-size: 0.875rem;
  }

  .filter-section select {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    font-family: inherit;
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
    color: var(--color-primary);
    text-align: center;
  }

  .no-chords {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .no-chords p {
    margin: var(--spacing-xs) 0;
  }

  .chords-table-container {
    overflow-x: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .chords-table {
    width: 100%;
    border-collapse: collapse;
    background-color: var(--color-surface);
  }

  .chords-table thead {
    background-color: var(--color-bg-secondary);
    border-bottom: 2px solid var(--color-border);
  }

  .chords-table th {
    padding: var(--spacing-sm) var(--spacing-md);
    text-align: left;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .chords-table td {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  .chords-table tbody tr:last-child td {
    border-bottom: none;
  }

  .chords-table tbody tr:hover {
    background-color: var(--color-bg-secondary);
  }

  .chord-name {
    font-weight: 600;
    font-family: monospace;
    font-size: 1rem;
  }

  .positions {
    font-family: monospace;
    font-size: 0.875rem;
  }

  .description {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-description {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .summary {
    margin-top: var(--spacing-md);
    padding: var(--spacing-sm);
    text-align: center;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .input-group {
      flex-direction: column;
    }

    .chord-name-input,
    .instrument-select {
      flex: 1;
    }

    .chords-table {
      font-size: 0.875rem;
    }

    .chords-table th,
    .chords-table td {
      padding: var(--spacing-xs) var(--spacing-sm);
    }
  }
</style>
