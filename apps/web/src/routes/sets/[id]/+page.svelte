<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { SongSet, Song } from '@gigwidget/core';

  let set = $state<SongSet | null>(null);
  let allSongs = $state<Song[]>([]);
  let setSongs = $state<Song[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let hasLoaded = false;
  let showAddModal = $state(false);
  let draggedIndex = $state<number | null>(null);

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
        error = 'Set not found';
        loading = false;
        return;
      }

      set = foundSet;

      // Load all user songs for the add modal
      const users = await db.users.toArray();
      if (users.length > 0) {
        allSongs = await SongRepository.getByOwner(users[0].id);
      }

      // Load songs in this set (in order)
      setSongs = set.songIds
        .map((id) => allSongs.find((s) => s.id === id))
        .filter((s): s is Song => s !== undefined);
    } catch (err) {
      console.error('Failed to load set:', err);
      error = err instanceof Error ? err.message : 'Failed to load set';
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

  function getAvailableSongs(): Song[] {
    if (!set) return allSongs;
    return allSongs.filter((s) => !set.songIds.includes(s.id));
  }
</script>

<svelte:head>
  <title>{set?.name ?? 'Loading...'} - Gigwidget</title>
</svelte:head>

<main class="container">
  {#if loading}
    <div class="loading">Loading set...</div>
  {:else if error}
    <div class="error-container">
      <p>{error}</p>
      <a href="/sets" class="btn btn-secondary">Back to Sets</a>
    </div>
  {:else if set}
    <header class="page-header">
      <div class="header-left">
        <a href="/sets" class="back-link">← Back to Sets</a>
        <h1>{set.name}</h1>
        {#if set.isSetlist}
          <span class="setlist-badge">Setlist</span>
        {/if}
        {#if set.description}
          <p class="set-description">{set.description}</p>
        {/if}
      </div>
      <button class="btn btn-primary" onclick={() => (showAddModal = true)}>+ Add Songs</button>
    </header>

    {#if setSongs.length === 0}
      <div class="empty-state">
        <p>No songs in this set yet.</p>
        <button class="btn btn-primary" onclick={() => (showAddModal = true)}>Add Songs</button>
      </div>
    {:else}
      <div class="song-list-header">
        <span class="song-count">{setSongs.length} song{setSongs.length !== 1 ? 's' : ''}</span>
        {#if set.isSetlist}
          <span class="drag-hint">Drag to reorder</span>
        {/if}
      </div>

      <ul class="song-list">
        {#each setSongs as song, index (song.id)}
          <li
            class="song-item"
            class:dragging={draggedIndex === index}
            draggable={set.isSetlist}
            ondragstart={() => handleDragStart(index)}
            ondragover={(e) => handleDragOver(e, index)}
            ondrop={(e) => handleDrop(e, index)}
            ondragend={handleDragEnd}
          >
            {#if set.isSetlist}
              <span class="song-number">{index + 1}</span>
            {/if}
            <a href="/songs/{song.id}" class="song-link">
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
              title="Remove from set"
            >
              ×
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>

{#if showAddModal}
  <div class="modal-overlay" onclick={() => (showAddModal = false)}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Add Songs to Set</h2>

      {#if getAvailableSongs().length === 0}
        <p class="empty-message">All your songs are already in this set!</p>
      {:else}
        <ul class="available-songs">
          {#each getAvailableSongs() as song (song.id)}
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
      {/if}

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={() => (showAddModal = false)}>Done</button>
      </div>
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

  .setlist-badge {
    display: inline-block;
    background-color: var(--color-primary);
    color: white;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    width: fit-content;
  }

  .set-description {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: 0;
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .error-container {
    text-align: center;
    padding: var(--spacing-xl);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
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

  .song-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md) 0;
  }

  .song-count {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .drag-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .song-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .song-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast), opacity var(--transition-fast);
  }

  .song-item:hover {
    background-color: var(--color-surface);
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
    width: 2rem;
    height: 2rem;
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .song-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: 1;
    color: inherit;
    text-decoration: none;
  }

  .song-info {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .song-title {
    font-weight: 500;
  }

  .song-artist {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .song-key {
    background-color: var(--color-secondary);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .btn-remove {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    padding: var(--spacing-xs);
    line-height: 1;
    transition: color var(--transition-fast);
  }

  .btn-remove:hover {
    color: var(--color-primary);
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
    margin: 0 0 var(--spacing-lg);
  }

  .empty-message {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--spacing-lg);
  }

  .available-songs {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    max-height: 300px;
    overflow-y: auto;
  }

  .available-song-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-sm);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.75rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--spacing-lg);
  }
</style>
