<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import type { Song, SongSet, SavedSong } from '@gigwidget/core';
  import {
    searchPublicSongs,
    searchPublicSongSets,
    getPublicSongSet,
    fromSupabaseSong,
    saveSongToSupabase,
    saveSavedSongReference,
    type SupabaseSong,
    type SupabaseSongSet,
  } from '$lib/stores/supabaseStore';
  import { toast } from '$lib/stores/toastStore.svelte';

  // Tab state
  type Tab = 'songs' | 'collections';
  let activeTab = $state<Tab>('songs');

  // Songs state
  let searchQuery = $state('');
  let remoteSongs = $state<SupabaseSong[]>([]);
  // Track which source (original) song IDs we've saved - NOT the local song IDs
  let savedSourceIds = $state<Set<string>>(new Set());
  // Map from sourceId to local savedSongId for navigation
  let sourceToLocalMap = $state<Map<string, string>>(new Map());
  let loading = $state(true);
  let searching = $state(false);
  let error = $state<string | null>(null);
  let totalCount = $state(0);
  let hasLoaded = false;

  // Collections state
  let remoteCollections = $state<SupabaseSongSet[]>([]);
  let localCollectionIds = $state<Set<string>>(new Set());
  let collectionsLoading = $state(false);
  let collectionsError = $state<string | null>(null);
  let collectionsTotalCount = $state(0);
  let collectionsHasLoaded = false;

  // Pagination
  const PAGE_SIZE = 50;
  let offset = $state(0);
  let collectionsOffset = $state(0);

  // Debounce timer for search
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Adding state
  let addingSongId = $state<string | null>(null);
  let addingCollectionId = $state<string | null>(null);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadInitialData();
  });

  // Debounced search when query changes
  $effect(() => {
    if (!hasLoaded) return;
    const query = searchQuery; // Track the reactive value
    const tab = activeTab;

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
      if (tab === 'songs') {
        offset = 0;
        searchSongs();
      } else {
        collectionsOffset = 0;
        searchCollections();
      }
    }, 300);

    return () => {
      if (searchTimeout) clearTimeout(searchTimeout);
    };
  });

  // Load collections when switching to collections tab
  $effect(() => {
    if (activeTab === 'collections' && !collectionsHasLoaded && hasLoaded) {
      collectionsHasLoaded = true;
      searchCollections();
    }
  });

  async function loadInitialData() {
    try {
      const { getDatabase, SavedSongRepository, SongSetRepository } = await import('@gigwidget/db');
      const db = getDatabase();

      // Get local user
      const users = await db.users.toArray();
      const user = users[0];

      if (user) {
        // Load saved song references to know which public songs are in library
        // This uses the new lineage system - we track sourceIds not local song IDs
        const savedSongs = await SavedSongRepository.getByUser(user.id);
        savedSourceIds = new Set(savedSongs.map((s) => s.sourceId));
        sourceToLocalMap = new Map(savedSongs.map((s) => [s.sourceId, s.savedSongId]));

        // Also check for any songs that were saved before the lineage system
        // (they have sourceId set directly on the song)
        const songsWithSource = await db.songs
          .where({ ownerId: user.id })
          .filter((s) => s.sourceId !== undefined)
          .toArray();
        for (const song of songsWithSource) {
          if (song.sourceId && !savedSourceIds.has(song.sourceId)) {
            savedSourceIds = new Set([...savedSourceIds, song.sourceId]);
            sourceToLocalMap = new Map([...sourceToLocalMap, [song.sourceId, song.id]]);
          }
        }

        // Load local collection IDs
        const localSets = await SongSetRepository.getByUser(user.id);
        localCollectionIds = new Set(localSets.map((s) => s.id));
      }

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

  async function searchCollections() {
    collectionsLoading = true;
    collectionsError = null;

    try {
      const { data, error: searchError, count } = await searchPublicSongSets(searchQuery, {
        limit: PAGE_SIZE,
        offset: collectionsOffset,
      });

      if (searchError) {
        // Table might not exist yet
        if (String(searchError).includes('does not exist')) {
          collectionsError = null;
          remoteCollections = [];
          collectionsTotalCount = 0;
          return;
        }
        collectionsError = 'Failed to search collections';
        return;
      }

      remoteCollections = data ?? [];
      collectionsTotalCount = count ?? 0;
    } catch (err) {
      console.error('Collections search failed:', err);
      // Don't show error if table doesn't exist
      if (!String(err).includes('does not exist')) {
        collectionsError = 'Search failed';
      }
    } finally {
      collectionsLoading = false;
    }
  }

  function loadMore() {
    if (activeTab === 'songs') {
      offset += PAGE_SIZE;
      loadMoreSongs();
    } else {
      collectionsOffset += PAGE_SIZE;
      loadMoreCollections();
    }
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

  async function loadMoreCollections() {
    collectionsLoading = true;

    try {
      const { data, error: searchError } = await searchPublicSongSets(searchQuery, {
        limit: PAGE_SIZE,
        offset: collectionsOffset,
      });

      if (searchError) {
        collectionsError = 'Failed to load more collections';
        return;
      }

      remoteCollections = [...remoteCollections, ...(data ?? [])];
    } catch (err) {
      console.error('Load more collections failed:', err);
    } finally {
      collectionsLoading = false;
    }
  }

  async function addSongToLibrary(remoteSong: SupabaseSong) {
    addingSongId = remoteSong.id;

    try {
      const { getDatabase, SavedSongRepository } = await import('@gigwidget/db');
      const { createSavedSong, createSavedSongReference, createArrangement } = await import('@gigwidget/core');
      const db = getDatabase();

      // Get local user
      const users = await db.users.toArray();
      const user = users[0];
      if (!user) {
        error = 'No local user found';
        return;
      }

      // Check if already saved (by source ID, not local ID)
      const existingSave = await SavedSongRepository.getByUserAndSource(user.id, remoteSong.id);
      if (existingSave) {
        toast.info('Song is already in your library');
        return;
      }

      // Create NEW local song with type='saved' and sourceId pointing to original
      // This generates a NEW unique ID - we don't reuse the remote song's ID
      const newSong = createSavedSong(
        {
          id: remoteSong.id,
          title: remoteSong.title,
          artist: remoteSong.artist ?? undefined,
          key: remoteSong.key as Song['key'],
          tempo: remoteSong.tempo ?? undefined,
          timeSignature: remoteSong.time_signature ?? undefined,
          tags: remoteSong.tags ?? [],
        },
        user.id
      );

      // Create arrangement with content if available
      const contentLength = remoteSong.content?.length ?? 0;
      console.log(`[Browse] Saving song "${remoteSong.title}" as NEW id: ${newSong.id} (source: ${remoteSong.id}), content: ${contentLength} chars`);

      const arrangement = createArrangement(newSong.id, 'guitar', {
        content: remoteSong.content ?? '',
      });

      // Create saved song reference for tracking lineage
      const savedSongRef: SavedSong = createSavedSongReference(
        user.id,
        remoteSong.id,  // sourceId - the original public song
        newSong.id      // savedSongId - our new local copy
      );

      // Save locally
      await db.songs.add(newSong);
      await db.arrangements.add(arrangement);
      await SavedSongRepository.create(savedSongRef);

      console.log(`[Browse] Successfully saved song with lineage tracking`);

      // Sync to cloud if user is logged in
      if (user.supabaseId) {
        try {
          // Save the song to Supabase
          const { error: songError } = await saveSongToSupabase(
            user.supabaseId,
            newSong,
            remoteSong.content ?? ''
          );
          if (songError) {
            console.warn('[Browse] Failed to sync saved song to cloud:', songError);
          }

          // Save the reference to Supabase
          const { error: refError } = await saveSavedSongReference(
            user.supabaseId,
            remoteSong.id,
            newSong.id
          );
          if (refError) {
            console.warn('[Browse] Failed to sync saved song reference to cloud:', refError);
          }
        } catch (syncErr) {
          console.warn('[Browse] Cloud sync failed, song saved locally:', syncErr);
        }
      }

      // Update local tracking
      savedSourceIds = new Set([...savedSourceIds, remoteSong.id]);
      sourceToLocalMap = new Map([...sourceToLocalMap, [remoteSong.id, newSong.id]]);

      toast.success(`"${newSong.title}" added to library`);
    } catch (err) {
      console.error('Failed to add to library:', err);
      error = 'Failed to add song to library';
      toast.error('Failed to add song to library');
    } finally {
      addingSongId = null;
    }
  }

  async function addCollectionToLibrary(remoteCollection: SupabaseSongSet) {
    addingCollectionId = remoteCollection.id;

    try {
      const { getDatabase, SongSetRepository, SavedSongRepository } = await import('@gigwidget/db');
      const { generateId, createSavedSong, createSavedSongReference, createArrangement } = await import('@gigwidget/core');
      const db = getDatabase();

      // Get local user
      const users = await db.users.toArray();
      const user = users[0];
      if (!user) {
        error = 'No local user found';
        return;
      }

      // Fetch the full collection with songs
      const { data: fullCollection, error: fetchError } = await getPublicSongSet(remoteCollection.id);
      if (fetchError || !fullCollection) {
        error = 'Failed to fetch collection details';
        return;
      }

      console.log(`[Browse] Saving collection "${remoteCollection.name}" with ${fullCollection.songs.length} songs`);

      // Add all songs first, tracking the NEW local IDs for the collection
      const localSongIds: string[] = [];
      let songsAdded = 0;
      let songsSkipped = 0;

      for (const remoteSong of fullCollection.songs) {
        // Check if already saved by source ID
        const existingSave = await SavedSongRepository.getByUserAndSource(user.id, remoteSong.id);
        if (existingSave) {
          // Already saved - use the existing local song ID
          localSongIds.push(existingSave.savedSongId);
          songsSkipped++;
          continue;
        }

        // Also check if in sourceToLocalMap (from initial load)
        if (sourceToLocalMap.has(remoteSong.id)) {
          localSongIds.push(sourceToLocalMap.get(remoteSong.id)!);
          songsSkipped++;
          continue;
        }

        // Create NEW local song with type='saved' and lineage tracking
        const newSong = createSavedSong(
          {
            id: remoteSong.id,
            title: remoteSong.title,
            artist: remoteSong.artist ?? undefined,
            key: remoteSong.key as Song['key'],
            tempo: remoteSong.tempo ?? undefined,
            timeSignature: remoteSong.time_signature ?? undefined,
            tags: remoteSong.tags ?? [],
          },
          user.id
        );

        const arrangement = createArrangement(newSong.id, 'guitar', {
          content: remoteSong.content ?? '',
        });

        // Create saved song reference
        const savedSongRef: SavedSong = createSavedSongReference(
          user.id,
          remoteSong.id,
          newSong.id
        );

        await db.songs.put(newSong);
        await db.arrangements.put(arrangement);
        await SavedSongRepository.create(savedSongRef);

        localSongIds.push(newSong.id);
        savedSourceIds = new Set([...savedSourceIds, remoteSong.id]);
        sourceToLocalMap = new Map([...sourceToLocalMap, [remoteSong.id, newSong.id]]);
        songsAdded++;

        // Sync to cloud if logged in
        if (user.supabaseId) {
          try {
            await saveSongToSupabase(user.supabaseId, newSong, remoteSong.content ?? '');
            await saveSavedSongReference(user.supabaseId, remoteSong.id, newSong.id);
          } catch (syncErr) {
            console.warn('[Browse] Failed to sync song to cloud:', syncErr);
          }
        }
      }

      // Create local collection with NEW unique ID and the LOCAL song IDs
      const newCollectionId = generateId();
      const newCollection: SongSet = {
        id: newCollectionId,
        userId: user.id,
        name: remoteCollection.name,
        description: remoteCollection.description ?? undefined,
        songIds: localSongIds, // Use LOCAL song IDs, not remote IDs
        isSetlist: remoteCollection.is_setlist,
        visibility: 'private',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await SongSetRepository.create(newCollection);
      console.log(`[Browse] Successfully saved collection: ${songsAdded} songs added, ${songsSkipped} already in library`);

      // Update local tracking
      localCollectionIds = new Set([...localCollectionIds, newCollectionId]);

      toast.success(`"${newCollection.name}" added with ${localSongIds.length} songs`);
    } catch (err) {
      console.error('Failed to add collection to library:', err);
      error = 'Failed to add collection to library';
      toast.error('Failed to add collection to library');
    } finally {
      addingCollectionId = null;
    }
  }

  function viewSong(sourceId: string) {
    // Navigate to the LOCAL song ID, not the source ID
    const localId = sourceToLocalMap.get(sourceId);
    if (localId) {
      goto(`/library/${localId}`);
    } else {
      // Fallback - shouldn't happen if data is consistent
      console.warn(`[Browse] No local ID found for source ${sourceId}`);
      toast.error('Could not find song in library');
    }
  }

  function viewCollection(collectionId: string) {
    goto(`/collections/${collectionId}`);
  }

  let hasMoreSongs = $derived(remoteSongs.length < totalCount);
  let hasMoreCollections = $derived(remoteCollections.length < collectionsTotalCount);
  let showingCount = $derived(activeTab === 'songs' ? remoteSongs.length : remoteCollections.length);
  let currentTotalCount = $derived(activeTab === 'songs' ? totalCount : collectionsTotalCount);
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
        placeholder="Search public {activeTab}..."
        class="search-input"
      />
      {#if searchQuery}
        <button class="clear-search" onclick={() => (searchQuery = '')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      {/if}
    </div>
  </header>

  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'songs'}
      onclick={() => activeTab = 'songs'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
      Songs
    </button>
    <button
      class="tab"
      class:active={activeTab === 'collections'}
      onclick={() => activeTab = 'collections'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      Collections
    </button>
  </div>

  <div class="browse-content">
    {#if activeTab === 'songs'}
      <!-- Songs Tab -->
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
              {showingCount} of {currentTotalCount} results for "{searchQuery}"
            {:else}
              Showing {showingCount} of {currentTotalCount} public songs
            {/if}
          </span>
          {#if searching}
            <span class="searching-indicator">Searching...</span>
          {/if}
        </div>

        <ul class="item-list">
          {#each remoteSongs as song (song.id)}
            {@const isInLibrary = savedSourceIds.has(song.id)}
            <li class="item" class:in-library={isInLibrary}>
              <div class="item-main">
                <div class="item-info">
                  <span class="item-title">{song.title}</span>
                  {#if song.artist}
                    <span class="item-subtitle">{song.artist}</span>
                  {/if}
                </div>
                <div class="item-meta">
                  {#if song.key}
                    <span class="item-badge">{song.key}</span>
                  {/if}
                  {#if song.tags && song.tags.length > 0}
                    <span class="item-tags">{song.tags.slice(0, 2).join(', ')}</span>
                  {/if}
                </div>
              </div>

              <div class="item-actions">
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
                  <button
                    class="btn btn-primary btn-sm"
                    onclick={() => addSongToLibrary(song)}
                    disabled={addingSongId === song.id}
                  >
                    {addingSongId === song.id ? 'Adding...' : 'Add'}
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>

        {#if hasMoreSongs}
          <div class="load-more">
            <button class="btn btn-secondary" onclick={loadMore} disabled={searching}>
              {searching ? 'Loading...' : 'Load More'}
            </button>
          </div>
        {/if}
      {/if}
    {:else}
      <!-- Collections Tab -->
      {#if collectionsLoading && remoteCollections.length === 0}
        <div class="loading-state">
          <p>Loading public collections...</p>
        </div>
      {:else if collectionsError}
        <div class="error-state">
          <p>{collectionsError}</p>
          <button class="btn btn-secondary" onclick={() => searchCollections()}>Retry</button>
        </div>
      {:else if remoteCollections.length === 0}
        <div class="empty-state">
          {#if searchQuery}
            <p>No collections found matching "{searchQuery}"</p>
          {:else}
            <p>No public collections available yet.</p>
            <p class="hint">Share your own collections to see them here!</p>
          {/if}
        </div>
      {:else}
        <div class="results-info">
          <span>
            {#if searchQuery}
              {showingCount} of {currentTotalCount} results for "{searchQuery}"
            {:else}
              Showing {showingCount} of {currentTotalCount} public collections
            {/if}
          </span>
          {#if collectionsLoading}
            <span class="searching-indicator">Searching...</span>
          {/if}
        </div>

        <ul class="item-list">
          {#each remoteCollections as collection (collection.id)}
            {@const isInLibrary = localCollectionIds.has(collection.id)}
            <li class="item" class:in-library={isInLibrary}>
              <div class="item-icon">
                {#if collection.is_setlist}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="8" y1="6" x2="21" y2="6"/>
                    <line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                {:else}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                {/if}
              </div>
              <div class="item-main">
                <div class="item-info">
                  <span class="item-title">{collection.name}</span>
                  {#if collection.description}
                    <span class="item-subtitle">{collection.description}</span>
                  {/if}
                </div>
                <div class="item-meta">
                  <span class="item-count">{collection.song_ids.length} songs</span>
                  {#if collection.is_setlist}
                    <span class="setlist-badge">Setlist</span>
                  {/if}
                </div>
              </div>

              <div class="item-actions">
                {#if isInLibrary}
                  <span class="in-library-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    In Library
                  </span>
                  <button class="btn btn-secondary btn-sm" onclick={() => viewCollection(collection.id)}>
                    View
                  </button>
                {:else}
                  <button
                    class="btn btn-primary btn-sm"
                    onclick={() => addCollectionToLibrary(collection)}
                    disabled={addingCollectionId === collection.id}
                  >
                    {addingCollectionId === collection.id ? 'Adding...' : 'Add All'}
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>

        {#if hasMoreCollections}
          <div class="load-more">
            <button class="btn btn-secondary" onclick={loadMore} disabled={collectionsLoading}>
              {collectionsLoading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        {/if}
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

  .tabs {
    display: flex;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg);
    flex-shrink: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-md);
    border: none;
    background: none;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
  }

  .tab:hover {
    color: var(--color-text);
    background-color: var(--color-bg-secondary);
  }

  .tab.active {
    color: var(--color-primary);
    background-color: var(--color-surface);
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

  .empty-state .hint {
    font-size: 0.875rem;
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

  .item-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .item {
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

  .item:hover {
    border-color: var(--color-primary);
  }

  .item.in-library {
    background-color: rgba(74, 222, 128, 0.05);
    border-color: rgba(74, 222, 128, 0.3);
  }

  .item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background-color: var(--color-surface);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .item-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .item-info {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .item-title {
    font-weight: 500;
    color: var(--color-text);
  }

  .item-subtitle {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .item-meta {
    display: flex;
    gap: var(--spacing-sm);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .item-badge {
    background-color: var(--color-surface);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
  }

  .item-count {
    color: var(--color-text-muted);
  }

  .setlist-badge {
    background-color: var(--color-primary);
    color: white;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .in-library-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background-color: rgba(74, 222, 128, 0.2);
    color: #4ade80;
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

    .item {
      flex-direction: column;
      align-items: stretch;
    }

    .item-actions {
      justify-content: flex-end;
      padding-top: var(--spacing-sm);
      border-top: 1px solid var(--color-border);
    }
  }
</style>
