<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import type { Song, SongSet } from '@gigwidget/core';
  import SongList from '$lib/components/SongList.svelte';
  import ExportModal from '$lib/components/ExportModal.svelte';
  import type { ExportSongData } from '$lib/services/exportService';

  let songs = $state<Song[]>([]);
  let collections = $state<SongSet[]>([]);
  let loading = $state(true);
  let hasLoaded = false;
  let currentUserId = $state<string | null>(null);

  // Selection state
  let selectedIds = $state<Set<string>>(new Set());
  let songListRef: SongList | undefined = $state();

  // Modal state
  let showDeleteModal = $state(false);
  let showAddToCollectionModal = $state(false);
  let showCreateCollectionModal = $state(false);
  let deleting = $state(false);
  let addingToCollection = $state(false);
  let creatingCollection = $state(false);
  let newCollectionName = $state('');
  let showExportModal = $state(false);
  let exportSongData = $state<ExportSongData[]>([]);
  let loadingExport = $state(false);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadData();
  });

  async function loadData() {
    try {
      const { SongRepository, SongSetRepository, getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      // Get current user
      const users = await db.users.toArray();
      if (users.length > 0) {
        currentUserId = users[0].id;
        songs = await SongRepository.getByOwner(users[0].id);
        collections = await SongSetRepository.getByUser(users[0].id);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      loading = false;
    }
  }

  function handleSelectSong(id: string) {
    goto(`/library/${id}`);
  }

  function handleSelectionChange(ids: Set<string>) {
    selectedIds = ids;
  }

  // Delete selected songs
  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    showDeleteModal = true;
  }

  async function confirmDelete() {
    deleting = true;
    try {
      const { SongRepository } = await import('@gigwidget/db');
      for (const id of selectedIds) {
        await SongRepository.delete(id);
      }
      // Refresh songs list
      songs = songs.filter(s => !selectedIds.has(s.id));
      songListRef?.clearSelection();
      showDeleteModal = false;
    } catch (err) {
      console.error('Failed to delete songs:', err);
    } finally {
      deleting = false;
    }
  }

  // Add selected songs to an existing collection
  function handleAddToCollection() {
    if (selectedIds.size === 0) return;
    showAddToCollectionModal = true;
  }

  async function addToCollection(collectionId: string) {
    addingToCollection = true;
    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      for (const songId of selectedIds) {
        await SongSetRepository.addSong(collectionId, songId);
      }
      songListRef?.clearSelection();
      showAddToCollectionModal = false;
    } catch (err) {
      console.error('Failed to add songs to collection:', err);
    } finally {
      addingToCollection = false;
    }
  }

  // Create a new collection with selected songs
  function handleCreateCollection() {
    if (selectedIds.size === 0) return;
    newCollectionName = '';
    showCreateCollectionModal = true;
  }

  async function createCollection() {
    if (!newCollectionName.trim() || !currentUserId) return;

    creatingCollection = true;
    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      const { generateId } = await import('@gigwidget/core');

      const newCollection: SongSet = {
        id: generateId(),
        userId: currentUserId,
        name: newCollectionName.trim(),
        songIds: Array.from(selectedIds),
        isSetlist: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await SongSetRepository.create(newCollection);
      collections = [...collections, newCollection];
      songListRef?.clearSelection();
      showCreateCollectionModal = false;

      // Navigate to the new collection
      goto(`/collections/${newCollection.id}`);
    } catch (err) {
      console.error('Failed to create collection:', err);
    } finally {
      creatingCollection = false;
    }
  }

  async function handleExportSelected() {
    if (selectedIds.size === 0) return;
    loadingExport = true;
    try {
      const { prepareSongDataForExport } = await import('$lib/services/exportService');
      exportSongData = await prepareSongDataForExport(Array.from(selectedIds), 'as-is');
      showExportModal = true;
    } catch (err) {
      console.error('Failed to prepare export data:', err);
    } finally {
      loadingExport = false;
    }
  }

  function closeModals() {
    showDeleteModal = false;
    showAddToCollectionModal = false;
    showCreateCollectionModal = false;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      closeModals();
    }
  }
</script>

<svelte:head>
  <title>Library - Gigwidget</title>
</svelte:head>

<div class="library-page">
  <header class="page-header">
    <h1>Library</h1>
    <a href="/songs/new" class="btn btn-primary">+ New Song</a>
  </header>

  <div class="list-container">
    <SongList
      bind:this={songListRef}
      {songs}
      {loading}
      onSelect={handleSelectSong}
      onSelectionChange={handleSelectionChange}
      selectionEnabled={true}
    >
      <svelte:fragment slot="selection-actions">
        <button class="action-btn" onclick={handleAddToCollection} title="Add to collection">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <button class="action-btn" onclick={handleCreateCollection} title="Create new collection">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="action-label">New</span>
        </button>
        <button class="action-btn" onclick={handleExportSelected} title="Export selected" disabled={loadingExport}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button class="action-btn danger" onclick={handleDeleteSelected} title="Delete selected">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </svelte:fragment>
    </SongList>
  </div>
</div>

<!-- Delete confirmation modal -->
{#if showDeleteModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={handleBackdropClick}>
    <div class="modal">
      <h2>Delete {selectedIds.size} song{selectedIds.size === 1 ? '' : 's'}?</h2>
      <p class="modal-message">This action cannot be undone. The selected songs will be permanently deleted.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={() => showDeleteModal = false} disabled={deleting}>
          Cancel
        </button>
        <button class="btn btn-danger" onclick={confirmDelete} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Add to collection modal -->
{#if showAddToCollectionModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={handleBackdropClick}>
    <div class="modal">
      <h2>Add to Collection</h2>
      <p class="modal-message">Select a collection to add {selectedIds.size} song{selectedIds.size === 1 ? '' : 's'} to:</p>

      {#if collections.length === 0}
        <p class="empty-collections">No collections yet. Create one first!</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick={() => showAddToCollectionModal = false}>
            Cancel
          </button>
          <button class="btn btn-primary" onclick={() => { showAddToCollectionModal = false; handleCreateCollection(); }}>
            Create Collection
          </button>
        </div>
      {:else}
        <div class="collection-list">
          {#each collections as collection}
            <button
              class="collection-item"
              onclick={() => addToCollection(collection.id)}
              disabled={addingToCollection}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span class="collection-name">{collection.name}</span>
              <span class="collection-count">{collection.songIds.length} songs</span>
            </button>
          {/each}
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick={() => showAddToCollectionModal = false} disabled={addingToCollection}>
            Cancel
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Create collection modal -->
{#if showCreateCollectionModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={handleBackdropClick}>
    <div class="modal">
      <h2>Create Collection</h2>
      <p class="modal-message">Create a new collection with {selectedIds.size} song{selectedIds.size === 1 ? '' : 's'}:</p>

      <form onsubmit={(e) => { e.preventDefault(); createCollection(); }}>
        <div class="form-group">
          <label for="collection-name">Collection Name</label>
          <input
            id="collection-name"
            type="text"
            bind:value={newCollectionName}
            placeholder="Enter collection name..."
            disabled={creatingCollection}
          />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick={() => showCreateCollectionModal = false} disabled={creatingCollection}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={!newCollectionName.trim() || creatingCollection}>
            {creatingCollection ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showExportModal && exportSongData.length > 0}
  <ExportModal
    songs={exportSongData}
    mode="multi-select"
    onClose={() => showExportModal = false}
  />
{/if}

<style>
  .library-page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg);
    flex-shrink: 0;
  }

  .page-header h1 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .list-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Selection action buttons */
  :global(.selection-actions) .action-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background-color var(--transition-fast);
  }

  :global(.selection-actions) .action-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }

  :global(.selection-actions) .action-btn.danger:hover {
    background-color: rgba(255, 100, 100, 0.3);
  }

  :global(.selection-actions) .action-label {
    display: none;
  }

  @media (min-width: 480px) {
    :global(.selection-actions) .action-label {
      display: inline;
    }
  }

  /* Modal styles */
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
    max-width: 400px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .modal h2 {
    margin: 0 0 var(--spacing-sm) 0;
    font-size: 1.25rem;
  }

  .modal-message {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    margin-bottom: var(--spacing-lg);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
  }

  .btn-danger {
    background-color: #dc3545;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background-color: #c82333;
  }

  /* Collection list in modal */
  .collection-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: var(--spacing-md);
  }

  .collection-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface);
    border-radius: var(--radius-md);
    text-align: left;
    transition: all var(--transition-fast);
  }

  .collection-item:hover:not(:disabled) {
    background-color: var(--color-bg-secondary);
  }

  .collection-item:disabled {
    opacity: 0.5;
  }

  .collection-item svg {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  .collection-name {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .collection-count {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .empty-collections {
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--spacing-lg);
  }

  /* Form in modal */
  .form-group {
    margin-bottom: var(--spacing-md);
  }

  .form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: var(--spacing-xs);
  }

  .form-group input {
    width: 100%;
    padding: var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-secondary);
    color: var(--color-text);
    font-size: 0.9375rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .form-group input:disabled {
    opacity: 0.5;
  }
</style>
