<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import type { Song } from '@gigwidget/core';
  import {
    searchPublicSongs,
    fromSupabaseSong,
    type SupabaseSong,
  } from '$lib/stores/supabaseStore';

  // State
  let searchQuery = $state('');
  let remoteSongs = $state<SupabaseSong[]>([]);
  let localSongIds = $state<Set<string>>(new Set());
  let loading = $state(true);
  let searching = $state(false);
  let error = $state<string | null>(null);
  let totalCount = $state(0);
  let hasLoaded = false;

  // Pagination
  const PAGE_SIZE = 50;
  let offset = $state(0);

  // Debounce timer for search
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Adding state
  let addingSongId = $state<string | null>(null);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadInitialData();
  });

  // Debounced search when query changes
  $effect(() => {
    if (!hasLoaded) return;
    const query = searchQuery; // Track the reactive value

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
      offset = 0; // Reset pagination on new search
      searchSongs();
    }, 300);

    return () => {
      if (searchTimeout) clearTimeout(searchTimeout);
    };
  });

  async function loadInitialData() {
    try {
      // Load local song IDs to know which are already in library
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const localSongs = await db.songs.toArray();
      localSongIds = new Set(localSongs.map((s) => s.id));

      // Load initial public songs
      await searchSongs();
    } catch (err) {
      console.error('Failed to load browse data:', err);
      error = 'Failed to load songs';
    } finally {
      loading = false;
    }
  }

  async function searchSongs() {
    searching = true;
    error = null;

    try {
      const { data, error: searchError, count } = await searchPublicSongs(searchQuery, {
        limit: PAGE_SIZE,
        offset,
      });

      if (searchError) {
        error = 'Failed to search songs';
        return;
      }

      remoteSongs = data ?? [];
      totalCount = count ?? 0;
    } catch (err) {
      console.error('Search failed:', err);
      error = 'Search failed';
    } finally {
      searching = false;
    }
  }

  function loadMore() {
    offset += PAGE_SIZE;
    loadMoreSongs();
  }

  async function loadMoreSongs() {
    searching = true;

    try {
      const { data, error: searchError } = await searchPublicSongs(searchQuery, {
        limit: PAGE_SIZE,
        offset,
      });

      if (searchError) {
        error = 'Failed to load more songs';
        return;
      }

      remoteSongs = [...remoteSongs, ...(data ?? [])];
    } catch (err) {
      console.error('Load more failed:', err);
    } finally {
      searching = false;
    }
  }

  async function addToLibrary(remoteSong: SupabaseSong) {
    addingSongId = remoteSong.id;

    try {
      const { getDatabase } = await import('@gigwidget/db');
      const { generateId } = await import('@gigwidget/core');
      const db = getDatabase();

      // Get local user
      const users = await db.users.toArray();
      const user = users[0];
      if (!user) {
        error = 'No local user found';
        return;
      }

      // Create local song from remote data
      const songData = fromSupabaseSong(remoteSong);
      const newSong: Song = {
        id: remoteSong.id, // Keep same ID for sync
        ownerId: user.id,
        title: remoteSong.title,
        artist: remoteSong.artist ?? undefined,
        key: songData.key,
        tempo: songData.tempo,
        timeSignature: songData.timeSignature,
        tags: [...(remoteSong.tags ?? []), 'downloaded'],
        visibility: 'private', // Downloaded songs are private by default
        spaceIds: [],
        createdAt: new Date(remoteSong.created_at),
        updatedAt: new Date(),
        yjsDocId: generateId(),
      };

      // Create arrangement with content if available
      const { createArrangement } = await import('@gigwidget/core');
      const arrangement = createArrangement(newSong.id, 'guitar', {
        content: remoteSong.content ?? '',
      });

      await db.songs.add(newSong);
      await db.arrangements.add(arrangement);

      // Update local tracking
      localSongIds = new Set([...localSongIds, remoteSong.id]);
    } catch (err) {
      console.error('Failed to add to library:', err);
      error = 'Failed to add song to library';
    } finally {
      addingSongId = null;
    }
  }

  function viewSong(songId: string) {
    goto(`/library/${songId}`);
  }

  let hasMore = $derived(remoteSongs.length < totalCount);
  let showingCount = $derived(remoteSongs.length);
</script>

<svelte:head>
  <title>Browse - Gigwidget</title>
</svelte:head>

<div class="browse-page">
  <header class="page-header">
    <h1>Browse</h1>
    <div class="search-box">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search public songs..."
        class="search-input"
      />
      {#if searchQuery}
        <button class="clear-search" onclick={() => (searchQuery = '')}>x</button>
      {/if}
    </div>
  </header>

  <div class="browse-content">
    {#if loading}
      <div class="loading-state">
        <p>Loading public songs...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <p>{error}</p>
        <button class="btn btn-secondary" onclick={() => searchSongs()}>Retry</button>
      </div>
    {:else if remoteSongs.length === 0}
      <div class="empty-state">
        {#if searchQuery}
          <p>No songs found matching "{searchQuery}"</p>
        {:else}
          <p>No public songs available yet.</p>
        {/if}
      </div>
    {:else}
      <div class="results-info">
        <span>
          {#if searchQuery}
            {showingCount} of {totalCount} results for "{searchQuery}"
          {:else}
            Showing {showingCount} of {totalCount} public songs
          {/if}
        </span>
        {#if searching}
          <span class="searching-indicator">Searching...</span>
        {/if}
      </div>

      <ul class="song-list">
        {#each remoteSongs as song (song.id)}
          {@const isInLibrary = localSongIds.has(song.id)}
          <li class="song-item" class:in-library={isInLibrary}>
            <div class="song-main">
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
                {#if song.tags && song.tags.length > 0}
                  <span class="song-tags">{song.tags.slice(0, 2).join(', ')}</span>
                {/if}
              </div>
            </div>

            <div class="song-actions">
              {#if isInLibrary}
                <span class="in-library-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  In Library
                </span>
                <button class="btn btn-secondary btn-sm" onclick={() => viewSong(song.id)}>
                  View
                </button>
              {:else}
                <span class="remote-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                  </svg>
                  Remote
                </span>
                <button
                  class="btn btn-primary btn-sm"
                  onclick={() => addToLibrary(song)}
                  disabled={addingSongId === song.id}
                >
                  {addingSongId === song.id ? 'Adding...' : 'Add to Library'}
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>

      {#if hasMore}
        <div class="load-more">
          <button class="btn btn-secondary" onclick={loadMore} disabled={searching}>
            {searching ? 'Loading...' : 'Load More'}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .browse-page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg);
    flex-shrink: 0;
  }

  .page-header h1 {
    font-size: 1.25rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .search-box {
    position: relative;
    flex: 1;
    max-width: 400px;
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
    padding: var(--spacing-xs) var(--spacing-md);
    padding-left: 2.25rem;
    padding-right: 2rem;
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
    right: var(--spacing-xs);
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: var(--spacing-xs);
    font-size: 0.875rem;
  }

  .clear-search:hover {
    color: var(--color-text);
  }

  .browse-content {
    flex: 1;
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

  .results-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-md);
  }

  .searching-indicator {
    color: var(--color-primary);
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
    justify-content: space-between;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .song-item:hover {
    border-color: var(--color-primary);
  }

  .song-item.in-library {
    background-color: rgba(74, 222, 128, 0.05);
    border-color: rgba(74, 222, 128, 0.3);
  }

  .song-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .song-info {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .song-title {
    font-weight: 500;
    color: var(--color-text);
  }

  .song-artist {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .song-meta {
    display: flex;
    gap: var(--spacing-sm);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .song-key {
    background-color: var(--color-surface);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }

  .song-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .in-library-badge,
  .remote-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .in-library-badge {
    background-color: rgba(74, 222, 128, 0.2);
    color: #4ade80;
  }

  .remote-badge {
    background-color: var(--color-surface);
    color: var(--color-text-muted);
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.75rem;
  }

  .load-more {
    display: flex;
    justify-content: center;
    padding: var(--spacing-lg);
  }

  @media (max-width: 640px) {
    .page-header {
      flex-direction: column;
      align-items: stretch;
    }

    .search-box {
      max-width: none;
    }

    .song-item {
      flex-direction: column;
      align-items: stretch;
    }

    .song-actions {
      justify-content: flex-end;
      padding-top: var(--spacing-sm);
      border-top: 1px solid var(--color-border);
    }
  }
</style>
