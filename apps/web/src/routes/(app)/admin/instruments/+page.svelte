<script lang="ts">
  import { browser } from '$app/environment';
  import { hasPermission, type User } from '@gigwidget/core';
  import {
    loadAllInstrumentsAdmin,
    deleteCustomInstrument,
    type SupabaseCustomInstrument,
  } from '$lib/stores/supabaseStore';

  // Permission check
  let user = $state<User | null>(null);
  let canManageInstruments = $derived(user && hasPermission(user, 'create_system_chords'));

  // Data state
  let instruments = $state<SupabaseCustomInstrument[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let totalCount = $state(0);

  // Pagination
  let currentPage = $state(1);
  let pageSize = 50;
  let totalPages = $derived(Math.ceil(totalCount / pageSize));

  // Search
  let searchQuery = $state('');
  let searchTimeout: ReturnType<typeof setTimeout>;

  // Delete state
  let deletingId = $state<string | null>(null);
  let showDeleteModal = $state(false);
  let instrumentToDelete = $state<SupabaseCustomInstrument | null>(null);

  $effect(() => {
    if (browser) {
      loadUser();
      loadInstruments();
    }
  });

  // Debounced search
  $effect(() => {
    if (browser && searchQuery !== undefined) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 1;
        loadInstruments();
      }, 300);
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

  async function loadInstruments() {
    loading = true;
    error = null;

    try {
      const offset = (currentPage - 1) * pageSize;
      const result = await loadAllInstrumentsAdmin({
        limit: pageSize,
        offset,
        search: searchQuery,
      });

      if (result.error) {
        error = 'Failed to load instruments. You may not have moderator access.';
        console.error(result.error);
        return;
      }

      instruments = result.data ?? [];
      totalCount = result.count ?? 0;
    } catch (err) {
      console.error('Exception loading instruments:', err);
      error = 'Failed to load instruments';
    } finally {
      loading = false;
    }
  }

  function handlePageChange(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      loadInstruments();
    }
  }

  function confirmDelete(instrument: SupabaseCustomInstrument) {
    instrumentToDelete = instrument;
    showDeleteModal = true;
  }

  async function handleDelete() {
    if (!instrumentToDelete) return;

    deletingId = instrumentToDelete.id;

    try {
      const result = await deleteCustomInstrument(instrumentToDelete.id);

      if (result.error) {
        alert('Failed to delete instrument');
        console.error(result.error);
        return;
      }

      // Remove from list
      instruments = instruments.filter((i) => i.id !== instrumentToDelete!.id);
      totalCount = Math.max(0, totalCount - 1);
      showDeleteModal = false;
      instrumentToDelete = null;
    } catch (err) {
      console.error('Exception deleting instrument:', err);
      alert('Failed to delete instrument');
    } finally {
      deletingId = null;
    }
  }

  function cancelDelete() {
    showDeleteModal = false;
    instrumentToDelete = null;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatStrings(strings: string[]): string {
    return strings.join(' ');
  }
</script>

<svelte:head>
  <title>Instrument Administration - Gigwidget</title>
</svelte:head>

<div class="admin-page">
  <div class="page-header">
    <h1>Instrument Administration</h1>
    <span class="mod-badge">Moderator Panel</span>
  </div>

  {#if !canManageInstruments}
    <div class="permission-error">
      <h3>Access Denied</h3>
      <p>You do not have permission to access this page.</p>
      <p>This feature is only available to moderators.</p>
    </div>
  {:else}
    <div class="controls-bar">
      <div class="search-section">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search by instrument name..."
          class="search-input"
        />
      </div>
      <div class="stats">
        <span>Total Instruments: <strong>{totalCount}</strong></span>
      </div>
    </div>

    {#if loading}
      <div class="loading">Loading instruments...</div>
    {:else if error}
      <div class="error-message">{error}</div>
    {:else if instruments.length === 0}
      <div class="no-instruments">
        {#if searchQuery}
          <p>No instruments found matching "{searchQuery}"</p>
        {:else}
          <p>No custom instruments in the database.</p>
        {/if}
      </div>
    {:else}
      <div class="instruments-table-container">
        <table class="instruments-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Base Type</th>
              <th>Strings</th>
              <th>Frets</th>
              <th>Public</th>
              <th>Owner ID</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each instruments as instrument (instrument.id)}
              <tr>
                <td class="instrument-name">{instrument.name}</td>
                <td>{instrument.base_type}</td>
                <td class="strings-cell" title={instrument.strings.join(', ')}>
                  {formatStrings(instrument.strings)}
                </td>
                <td>{instrument.frets}</td>
                <td>
                  <span class="public-badge" class:is-public={instrument.is_public}>
                    {instrument.is_public ? 'Yes' : 'No'}
                  </span>
                </td>
                <td class="owner-id" title={instrument.user_id}>
                  {instrument.user_id.substring(0, 8)}...
                </td>
                <td>{formatDate(instrument.created_at)}</td>
                <td>
                  <button
                    type="button"
                    class="btn btn-sm btn-danger"
                    onclick={() => confirmDelete(instrument)}
                    disabled={deletingId === instrument.id}
                  >
                    {deletingId === instrument.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if totalPages > 1}
        <div class="pagination">
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            onclick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span class="page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            onclick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      {/if}

      <div class="summary">
        Showing {instruments.length} of {totalCount} instrument{totalCount !== 1 ? 's' : ''}
        {#if searchQuery}
          matching "{searchQuery}"
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Delete confirmation modal -->
{#if showDeleteModal && instrumentToDelete}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={cancelDelete}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Delete Instrument?</h2>
      <p class="modal-message">
        Are you sure you want to delete "<strong>{instrumentToDelete.name}</strong>"?
      </p>
      <p class="warning-text">
        This will permanently remove this custom instrument from Supabase. This action cannot be undone.
      </p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={cancelDelete}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-danger"
          onclick={handleDelete}
          disabled={deletingId !== null}
        >
          {deletingId ? 'Deleting...' : 'Delete Forever'}
        </button>
      </div>
    </div>
  </div>
{/if}

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

  .controls-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
    padding: var(--spacing-md);
    background-color: var(--color-surface);
    border-radius: var(--radius-md);
  }

  .search-section {
    flex: 1;
    max-width: 400px;
  }

  .search-input {
    width: 100%;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    font-family: inherit;
  }

  .stats {
    font-size: 0.875rem;
    color: var(--color-text-muted);
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

  .no-instruments {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .instruments-table-container {
    overflow-x: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .instruments-table {
    width: 100%;
    border-collapse: collapse;
    background-color: var(--color-surface);
  }

  .instruments-table thead {
    background-color: var(--color-bg-secondary);
    border-bottom: 2px solid var(--color-border);
  }

  .instruments-table th {
    padding: var(--spacing-sm) var(--spacing-md);
    text-align: left;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .instruments-table td {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  .instruments-table tbody tr:last-child td {
    border-bottom: none;
  }

  .instruments-table tbody tr:hover {
    background-color: var(--color-bg-secondary);
  }

  .instrument-name {
    font-weight: 600;
  }

  .strings-cell {
    font-family: monospace;
    font-size: 0.875rem;
  }

  .owner-id {
    font-family: monospace;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .public-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    background-color: rgba(158, 158, 158, 0.2);
    color: #9e9e9e;
  }

  .public-badge.is-public {
    background-color: rgba(76, 175, 80, 0.2);
    color: #4caf50;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-md);
    margin-top: var(--spacing-lg);
    padding: var(--spacing-md);
  }

  .page-info {
    font-size: 0.875rem;
    color: var(--color-text-muted);
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

  .btn-danger {
    background-color: #dc3545;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background-color: #c82333;
  }

  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Modal */
  .modal-overlay {
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

  .modal {
    background-color: var(--color-bg);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    max-width: 450px;
    width: 100%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .modal h2 {
    margin: 0 0 var(--spacing-sm) 0;
    font-size: 1.25rem;
  }

  .modal-message {
    color: var(--color-text);
    font-size: 0.9375rem;
    margin-bottom: var(--spacing-sm);
  }

  .warning-text {
    color: #dc3545;
    font-size: 0.875rem;
    margin-bottom: var(--spacing-lg);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
  }

  @media (max-width: 768px) {
    .controls-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .search-section {
      max-width: none;
    }

    .instruments-table {
      font-size: 0.875rem;
    }

    .instruments-table th,
    .instruments-table td {
      padding: var(--spacing-xs) var(--spacing-sm);
    }
  }
</style>
