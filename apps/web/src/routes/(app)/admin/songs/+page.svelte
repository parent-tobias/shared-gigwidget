<script lang="ts">
  import { browser } from '$app/environment';
  import { hasPermission, type User } from '@gigwidget/core';
  import {
    loadAllSongsAdmin,
    deleteSongFromSupabase,
    type SupabaseSong,
  } from '$lib/stores/supabaseStore';

  // Permission check
  let user = $state<User | null>(null);
  let canManageSongs = $derived(user && hasPermission(user, 'create_system_chords'));

  // Data state
  let songs = $state<SupabaseSong[]>([]);
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
  let songToDelete = $state<SupabaseSong | null>(null);

  $effect(() => {
    if (browser) {
      loadUser();
      loadSongs();
    }
  });

  // Debounced search
  $effect(() => {
    if (browser && searchQuery !== undefined) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 1;
        loadSongs();
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

  async function loadSongs() {
    loading = true;
    error = null;

    try {
      const offset = (currentPage - 1) * pageSize;
      const result = await loadAllSongsAdmin({
        limit: pageSize,
        offset,
        search: searchQuery,
      });

      if (result.error) {
        error = 'Failed to load songs. You may not have moderator access.';
        console.error(result.error);
        return;
      }

      songs = result.data ?? [];
      totalCount = result.count ?? 0;
    } catch (err) {
      console.error('Exception loading songs:', err);
      error = 'Failed to load songs';
    } finally {
      loading = false;
    }
  }

  function handlePageChange(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      loadSongs();
    }
  }

  function confirmDelete(song: SupabaseSong) {
    songToDelete = song;
    showDeleteModal = true;
  }

  async function handleDelete() {
    if (!songToDelete) return;

    deletingId = songToDelete.id;

    try {
      const result = await deleteSongFromSupabase(songToDelete.id);

      if (result.error) {
        alert('Failed to delete song');
        console.error(result.error);
        return;
      }

      // Remove from list
      songs = songs.filter((s) => s.id !== songToDelete!.id);
      totalCount = Math.max(0, totalCount - 1);
      showDeleteModal = false;
      songToDelete = null;
    } catch (err) {
      console.error('Exception deleting song:', err);
      alert('Failed to delete song');
    } finally {
      deletingId = null;
    }
  }

  function cancelDelete() {
    showDeleteModal = false;
    songToDelete = null;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getVisibilityBadgeClass(visibility: string): string {
    switch (visibility) {
      case 'public':
        return 'badge-public';
      case 'private':
        return 'badge-private';
      case 'unlisted':
        return 'badge-unlisted';
      default:
        return '';
    }
  }
</script>

<svelte:head>
  <title>Song Administration - Gigwidget</title>
</svelte:head>

<div class="admin-page">
  <div class="page-header">
    <h1>Song Administration</h1>
    <span class="mod-badge">Moderator Panel</span>
  </div>

  {#if !canManageSongs}
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
          placeholder="Search by title or artist..."
          class="search-input"
        />
      </div>
      <div class="stats">
        <span>Total Songs: <strong>{totalCount}</strong></span>
      </div>
    </div>

    {#if loading}
      <div class="loading">Loading songs...</div>
    {:else if error}
      <div class="error-message">{error}</div>
    {:else if songs.length === 0}
      <div class="no-songs">
        {#if searchQuery}
          <p>No songs found matching "{searchQuery}"</p>
        {:else}
          <p>No songs in the database.</p>
        {/if}
      </div>
    {:else}
      <div class="songs-table-container">
        <table class="songs-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Artist</th>
              <th>Key</th>
              <th>Visibility</th>
              <th>Owner ID</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each songs as song (song.id)}
              <tr>
                <td class="song-title">{song.title}</td>
                <td>{song.artist || '—'}</td>
                <td>{song.key || '—'}</td>
                <td>
                  <span class="visibility-badge {getVisibilityBadgeClass(song.visibility)}">
                    {song.visibility}
                  </span>
                </td>
                <td class="owner-id" title={song.user_id}>
                  {song.user_id.substring(0, 8)}...
                </td>
                <td>{formatDate(song.created_at)}</td>
                <td>{formatDate(song.updated_at)}</td>
                <td>
                  <button
                    type="button"
                    class="btn btn-sm btn-danger"
                    onclick={() => confirmDelete(song)}
                    disabled={deletingId === song.id}
                  >
                    {deletingId === song.id ? 'Deleting...' : 'Delete'}
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
        Showing {songs.length} of {totalCount} song{totalCount !== 1 ? 's' : ''}
        {#if searchQuery}
          matching "{searchQuery}"
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Delete confirmation modal -->
{#if showDeleteModal && songToDelete}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={cancelDelete}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Delete Song?</h2>
      <p class="modal-message">
        Are you sure you want to delete "<strong>{songToDelete.title}</strong>"
        {#if songToDelete.artist}
          by {songToDelete.artist}
        {/if}?
      </p>
      <p class="warning-text">
        This will permanently remove the song from Supabase. This action cannot be undone.
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

  .no-songs {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .songs-table-container {
    overflow-x: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .songs-table {
    width: 100%;
    border-collapse: collapse;
    background-color: var(--color-surface);
  }

  .songs-table thead {
    background-color: var(--color-bg-secondary);
    border-bottom: 2px solid var(--color-border);
  }

  .songs-table th {
    padding: var(--spacing-sm) var(--spacing-md);
    text-align: left;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .songs-table td {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  .songs-table tbody tr:last-child td {
    border-bottom: none;
  }

  .songs-table tbody tr:hover {
    background-color: var(--color-bg-secondary);
  }

  .song-title {
    font-weight: 600;
  }

  .owner-id {
    font-family: monospace;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .visibility-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-public {
    background-color: rgba(76, 175, 80, 0.2);
    color: #4caf50;
  }

  .badge-private {
    background-color: rgba(158, 158, 158, 0.2);
    color: #9e9e9e;
  }

  .badge-unlisted {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ff9800;
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

    .songs-table {
      font-size: 0.875rem;
    }

    .songs-table th,
    .songs-table td {
      padding: var(--spacing-xs) var(--spacing-sm);
    }
  }
</style>
