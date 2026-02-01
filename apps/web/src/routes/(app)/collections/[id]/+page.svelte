<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import type { SongSet, Song } from '@gigwidget/core';

  let set = $state<SongSet | null>(null);
  let allSongs = $state<Song[]>([]);
  let setSongs = $state<Song[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let hasLoaded = false;
  let showAddModal = $state(false);
  let draggedIndex = $state<number | null>(null);
  let songSearchQuery = $state('');
  let togglingVisibility = $state(false);

  // Edit collection info
  let showEditModal = $state(false);
  let editName = $state('');
  let editDescription = $state('');
  let savingInfo = $state(false);

  // Collection song search/sort
  let collectionSearchQuery = $state('');
  let sortBy = $state<'title' | 'artist' | 'key' | 'order'>('order');
  let sortDirection = $state<'asc' | 'desc'>('asc');

  // Current user for ownership check
  let currentUserId = $state<string | null>(null);

  const setId = $derived($page.params.id);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadSet();
  });

  async function loadSet() {
    try {
      const { SongSetRepository, SongRepository, getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      const foundSet = await SongSetRepository.getById(setId);
      if (!foundSet) {
        error = 'Collection not found';
        loading = false;
        return;
      }

      set = foundSet;

      // Load all user songs for the add modal
      const users = await db.users.toArray();
      if (users.length > 0) {
        currentUserId = users[0].id;
        allSongs = await SongRepository.getByOwner(users[0].id);
      }

      // Load songs in this set (in order)
      setSongs = set.songIds
        .map((id) => allSongs.find((s) => s.id === id))
        .filter((s): s is Song => s !== undefined);
    } catch (err) {
      console.error('Failed to load collection:', err);
      error = err instanceof Error ? err.message : 'Failed to load collection';
    } finally {
      loading = false;
    }
  }

  async function addSongToSet(songId: string) {
    if (!set) return;

    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      await SongSetRepository.addSong(set.id, songId);

      set = { ...set, songIds: [...set.songIds, songId] };
      const song = allSongs.find((s) => s.id === songId);
      if (song) {
        setSongs = [...setSongs, song];
      }

      // Sync to cloud
      const { syncSongSetToCloud } = await import('$lib/stores/syncStore.svelte');
      await syncSongSetToCloud(set);
    } catch (err) {
      console.error('Failed to add song:', err);
    }
  }

  async function removeSongFromSet(songId: string) {
    if (!set) return;

    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      await SongSetRepository.removeSong(set.id, songId);

      set = { ...set, songIds: set.songIds.filter((id) => id !== songId) };
      setSongs = setSongs.filter((s) => s.id !== songId);

      // Sync to cloud
      const { syncSongSetToCloud } = await import('$lib/stores/syncStore.svelte');
      await syncSongSetToCloud(set);
    } catch (err) {
      console.error('Failed to remove song:', err);
    }
  }

  async function reorderSongs(fromIndex: number, toIndex: number) {
    if (!set || fromIndex === toIndex) return;

    const newSongIds = [...set.songIds];
    const [moved] = newSongIds.splice(fromIndex, 1);
    newSongIds.splice(toIndex, 0, moved);

    const newSongs = [...setSongs];
    const [movedSong] = newSongs.splice(fromIndex, 1);
    newSongs.splice(toIndex, 0, movedSong);

    // Optimistic update
    set = { ...set, songIds: newSongIds };
    setSongs = newSongs;

    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      await SongSetRepository.reorderSongs(set.id, newSongIds);

      // Sync to cloud
      const { syncSongSetToCloud } = await import('$lib/stores/syncStore.svelte');
      await syncSongSetToCloud(set);
    } catch (err) {
      console.error('Failed to reorder songs:', err);
      // Reload on error
      await loadSet();
    }
  }

  function handleDragStart(index: number) {
    draggedIndex = index;
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
  }

  function handleDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      reorderSongs(draggedIndex, toIndex);
    }
    draggedIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
  }

  async function toggleVisibility() {
    if (!set || togglingVisibility) return;

    togglingVisibility = true;
    const newVisibility = set.visibility === 'public' ? 'private' : 'public';

    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      await SongSetRepository.update(set.id, { visibility: newVisibility });
      set = { ...set, visibility: newVisibility };

      // Sync to cloud
      const { syncSongSetToCloud } = await import('$lib/stores/syncStore.svelte');
      await syncSongSetToCloud(set);
    } catch (err) {
      console.error('Failed to update visibility:', err);
    } finally {
      togglingVisibility = false;
    }
  }

  async function saveInfo() {
    if (!set || !editName.trim() || savingInfo) return;

    savingInfo = true;
    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      await SongSetRepository.update(set.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });

      set = {
        ...set,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        updatedAt: new Date(),
      };

      // Sync to cloud
      const { syncSongSetToCloud } = await import('$lib/stores/syncStore.svelte');
      await syncSongSetToCloud(set);

      showEditModal = false;
    } catch (err) {
      console.error('Failed to update collection info:', err);
    } finally {
      savingInfo = false;
    }
  }

  async function deleteCollection() {
    if (!set || !isOwner) return;

    if (!confirm(`Delete this ${set.isSetlist ? 'setlist' : 'collection'}? Songs will not be deleted.`)) {
      return;
    }

    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      await SongSetRepository.delete(set.id);

      // Sync deletion to cloud
      const { deleteSongSetFromCloud } = await import('$lib/stores/syncStore.svelte');
      await deleteSongSetFromCloud(set.id);

      // Navigate back to collections
      const { goto } = await import('$app/navigation');
      await goto('/collections');
    } catch (err) {
      console.error('Failed to delete collection:', err);
      alert('Failed to delete collection');
    }
  }

  function openEditModal() {
    if (!set) return;
    editName = set.name;
    editDescription = set.description || '';
    showEditModal = true;
  }

  // Check if current user is the owner
  let isOwner = $derived(set?.userId === currentUserId);

  // Limit display to prevent rendering 3000+ items
  const MAX_DISPLAY = 100;

  // Filtered and sorted collection songs
  let displayedSetSongs = $derived.by(() => {
    let songs = [...setSongs];

    // Filter by search query
    if (collectionSearchQuery.trim()) {
      const query = collectionSearchQuery.toLowerCase().trim();
      songs = songs.filter((s) =>
        s.title.toLowerCase().includes(query) ||
        (s.artist && s.artist.toLowerCase().includes(query)) ||
        (s.key && s.key.toLowerCase().includes(query))
      );
    }

    // Sort (unless viewing as a setlist with order preserved)
    if (sortBy !== 'order' || !set?.isSetlist) {
      songs.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'artist':
            comparison = (a.artist || '').localeCompare(b.artist || '');
            break;
          case 'key':
            comparison = (a.key || '').localeCompare(b.key || '');
            break;
          case 'order':
          default:
            // Preserve original order
            return 0;
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return songs;
  });

  // Available songs for adding (filtered)
  let filteredSongs = $derived.by(() => {
    if (!set) return [];
    let available = allSongs.filter((s) => !set.songIds.includes(s.id));

    // Filter by search query
    if (songSearchQuery.trim()) {
      const query = songSearchQuery.toLowerCase().trim();
      available = available.filter((s) =>
        s.title.toLowerCase().includes(query) ||
        (s.artist && s.artist.toLowerCase().includes(query))
      );
    }

    return available;
  });

  let displayedSongs = $derived(filteredSongs.slice(0, MAX_DISPLAY));
  let hasMoreSongs = $derived(filteredSongs.length > MAX_DISPLAY);
</script>

<svelte:head>
  <title>{set?.name ?? 'Loading...'} - Gigwidget</title>
</svelte:head>

<div class="collection-detail">
  {#if loading}
    <div class="loading-state">
      <p>Loading collection...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>{error}</p>
      <a href="/collections" class="btn btn-secondary">Back to Collections</a>
    </div>
  {:else if set}
    <header class="page-header">
      <div class="header-left">
        <a href="/collections" class="back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          Collections
        </a>
        <div class="title-row">
          <h1>{set.name}</h1>
          {#if set.isSetlist}
            <span class="setlist-badge">Setlist</span>
          {/if}
          {#if set.visibility === 'public'}
            <span class="public-badge">Public</span>
          {/if}
        </div>
        {#if set.description}
          <p class="set-description">{set.description}</p>
        {/if}
      </div>
      <div class="header-actions">
        {#if isOwner}
          <button class="btn btn-icon" onclick={openEditModal} title="Edit collection info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-icon" onclick={deleteCollection} title="Delete collection">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <button
            class="btn btn-icon"
            class:active={set.visibility === 'public'}
            onclick={toggleVisibility}
            disabled={togglingVisibility}
            title={set.visibility === 'public' ? 'Make private' : 'Share publicly'}
          >
            {#if set.visibility === 'public'}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            {/if}
          </button>
        {/if}
        <button class="btn btn-primary" onclick={() => (showAddModal = true)}>+ Add Songs</button>
      </div>
    </header>

    <div class="collection-content">
      {#if setSongs.length === 0}
        <div class="empty-state">
          <p>No songs in this {set.isSetlist ? 'setlist' : 'collection'} yet.</p>
          <button class="btn btn-primary" onclick={() => (showAddModal = true)}>Add Songs</button>
        </div>
      {:else}
        <div class="controls-section">
          <div class="search-filter-row">
            <div class="search-box-inline">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                bind:value={collectionSearchQuery}
                placeholder="Search songs..."
                class="search-input-inline"
              />
              {#if collectionSearchQuery}
                <button class="clear-search" onclick={() => collectionSearchQuery = ''}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              {/if}
            </div>

            <div class="sort-controls">
              <select bind:value={sortBy} class="sort-select">
                <option value="order">Original Order</option>
                <option value="title">Title</option>
                <option value="artist">Artist</option>
                <option value="key">Key</option>
              </select>
              <button
                class="btn btn-icon btn-icon-sm"
                onclick={() => sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'}
                title={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
              >
                {#if sortDirection === 'asc'}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <polyline points="19 12 12 19 5 12"/>
                  </svg>
                {:else}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="19" x2="12" y2="5"/>
                    <polyline points="19 12 12 5 5 12"/>
                  </svg>
                {/if}
              </button>
            </div>
          </div>

          <div class="song-list-header">
            <span class="song-count">
              {displayedSetSongs.length} of {setSongs.length} song{setSongs.length !== 1 ? 's' : ''}
            </span>
            {#if set.isSetlist && sortBy === 'order'}
              <span class="drag-hint">Drag to reorder</span>
            {/if}
          </div>
        </div>

        <ul class="song-list">
          {#each displayedSetSongs as song, index (song.id)}
            <li
              class="song-item"
              class:dragging={draggedIndex === index}
              draggable={set.isSetlist && sortBy === 'order'}
              ondragstart={() => handleDragStart(index)}
              ondragover={(e) => handleDragOver(e, index)}
              ondrop={(e) => handleDrop(e, index)}
              ondragend={handleDragEnd}
            >
              {#if set.isSetlist}
                <span class="song-number">{index + 1}</span>
              {/if}
              <a href="/library/{song.id}?from=collection&collectionId={set.id}" class="song-link">
                <div class="song-info">
                  <span class="song-title">{song.title}</span>
                  {#if song.artist}
                    <span class="song-artist">{song.artist}</span>
                  {/if}
                </div>
                <div class="song-meta">
                  {#if song.key}
                    <span class="song-key">{song.key}</span>
                  {/if}
                </div>
              </a>
              <button
                class="btn-remove"
                onclick={() => removeSongFromSet(song.id)}
                title="Remove from {set.isSetlist ? 'setlist' : 'collection'}"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

{#if showAddModal}
  <div class="modal-overlay" onclick={() => { showAddModal = false; songSearchQuery = ''; }}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Add Songs</h2>

      <div class="search-box">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          bind:value={songSearchQuery}
          placeholder="Search by title or artist..."
          class="search-input"
        />
        {#if songSearchQuery}
          <button class="clear-search" onclick={() => songSearchQuery = ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        {/if}
      </div>

      <div class="results-info">
        {#if songSearchQuery.trim()}
          <span>{filteredSongs.length} matching songs</span>
        {:else}
          <span>{filteredSongs.length} songs available</span>
        {/if}
        {#if !songSearchQuery.trim() && filteredSongs.length > 0}
          <span class="search-hint">Type to search</span>
        {/if}
      </div>

      {#if filteredSongs.length === 0}
        {#if songSearchQuery.trim()}
          <p class="empty-message">No songs match "{songSearchQuery}"</p>
        {:else}
          <p class="empty-message">All your songs are already in this {set?.isSetlist ? 'setlist' : 'collection'}!</p>
        {/if}
      {:else}
        <ul class="available-songs">
          {#each displayedSongs as song (song.id)}
            <li class="available-song-item">
              <div class="song-info">
                <span class="song-title">{song.title}</span>
                {#if song.artist}
                  <span class="song-artist">{song.artist}</span>
                {/if}
              </div>
              <button class="btn btn-primary btn-sm" onclick={() => addSongToSet(song.id)}>
                Add
              </button>
            </li>
          {/each}
        </ul>
        {#if hasMoreSongs}
          <p class="more-hint">Showing {MAX_DISPLAY} of {filteredSongs.length} songs. Type to narrow results.</p>
        {/if}
      {/if}

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={() => { showAddModal = false; songSearchQuery = ''; }}>Done</button>
      </div>
    </div>
  </div>
{/if}

{#if showEditModal && set}
  <div class="modal-overlay" onclick={() => (showEditModal = false)}>
    <div class="modal modal-sm" onclick={(e) => e.stopPropagation()}>
      <h2>Edit {set.isSetlist ? 'Setlist' : 'Collection'}</h2>
      <form onsubmit={(e) => { e.preventDefault(); saveInfo(); }}>
        <div class="form-group">
          <label for="edit-name">Name</label>
          <input
            type="text"
            id="edit-name"
            bind:value={editName}
            placeholder="Name"
            required
            disabled={savingInfo}
          />
        </div>

        <div class="form-group">
          <label for="edit-description">Description <span class="optional">(optional)</span></label>
          <textarea
            id="edit-description"
            bind:value={editDescription}
            placeholder="What's this for?"
            rows="3"
            disabled={savingInfo}
          ></textarea>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick={() => (showEditModal = false)} disabled={savingInfo}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={savingInfo || !editName.trim()}>
            {savingInfo ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .collection-detail {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    min-width: 0;
  }

  .back-link {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .title-row h1 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  .setlist-badge {
    display: inline-block;
    background-color: var(--color-primary);
    color: white;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .public-badge {
    display: inline-block;
    background-color: rgba(74, 222, 128, 0.2);
    color: #4ade80;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-secondary);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-icon:hover {
    border-color: var(--color-primary);
    color: var(--color-text);
  }

  .btn-icon.active {
    background-color: rgba(74, 222, 128, 0.1);
    border-color: rgba(74, 222, 128, 0.5);
    color: #4ade80;
  }

  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .set-description {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .collection-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--spacing-md);
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    padding: var(--spacing-xl);
    text-align: center;
    color: var(--color-text-muted);
  }

  .song-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  .song-count {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .drag-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .song-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .song-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .song-item:hover {
    border-color: var(--color-primary);
  }

  .song-item.dragging {
    opacity: 0.5;
  }

  .song-item[draggable='true'] {
    cursor: grab;
  }

  .song-item[draggable='true']:active {
    cursor: grabbing;
  }

  .song-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .song-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: 1;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }

  .song-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .song-title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .song-artist {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .song-meta {
    flex-shrink: 0;
  }

  .song-key {
    background-color: var(--color-surface);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
  }

  .btn-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-remove:hover {
    color: var(--color-primary);
    background-color: var(--color-surface);
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
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal h2 {
    margin: 0 0 var(--spacing-md);
    font-size: 1.125rem;
  }

  .search-box {
    position: relative;
    margin-bottom: var(--spacing-sm);
  }

  .search-icon {
    position: absolute;
    left: var(--spacing-sm);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    padding-left: 2.25rem;
    padding-right: 2.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    background-color: var(--color-bg-secondary);
    color: var(--color-text);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .clear-search {
    position: absolute;
    right: var(--spacing-sm);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: var(--spacing-xs);
  }

  .clear-search:hover {
    color: var(--color-text);
  }

  .results-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-sm);
  }

  .search-hint {
    font-style: italic;
  }

  .more-hint {
    text-align: center;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: var(--spacing-sm);
    font-style: italic;
  }

  .empty-message {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--spacing-lg);
  }

  .available-songs {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    max-height: 300px;
    overflow-y: auto;
  }

  .available-song-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .available-song-item .song-info {
    min-width: 0;
    flex: 1;
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--spacing-lg);
  }

  /* Controls section */
  .controls-section {
    margin-bottom: var(--spacing-md);
  }

  .search-filter-row {
    display: flex;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
    align-items: center;
  }

  .search-box-inline {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .search-input-inline {
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-sm);
    padding-left: 2rem;
    padding-right: 2rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    background-color: var(--color-bg-secondary);
    color: var(--color-text);
  }

  .search-input-inline:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .sort-controls {
    display: flex;
    gap: var(--spacing-xs);
    align-items: center;
    flex-shrink: 0;
  }

  .sort-select {
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    background-color: var(--color-bg-secondary);
    color: var(--color-text);
    cursor: pointer;
  }

  .sort-select:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .btn-icon-sm {
    width: 28px;
    height: 28px;
    padding: 0;
  }

  /* Edit modal styles */
  .modal-sm {
    max-width: 400px;
  }

  .form-group {
    margin-bottom: var(--spacing-md);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--spacing-xs);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .optional {
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .form-group input[type="text"],
  .form-group textarea {
    width: 100%;
    padding: var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    background-color: var(--color-bg-secondary);
    color: var(--color-text);
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
  }

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .page-header .btn {
      align-self: flex-start;
    }

    .search-filter-row {
      flex-direction: column;
    }

    .sort-controls {
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>
