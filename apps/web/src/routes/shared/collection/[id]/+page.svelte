<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { getPublicSongSet, type SupabaseSong, type SupabaseSongSet } from '$lib/stores/supabaseStore';

  let collection = $state<(SupabaseSongSet & { songs: SupabaseSong[] }) | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!browser) return;
    // Ensure dark theme on shared pages (no AppShell to set data-theme)
    document.documentElement.setAttribute('data-theme', 'dark');
    const setId = $page.params.id;
    if (!setId) return;

    loadCollection(setId);
  });

  async function loadCollection(setId: string) {
    loading = true;
    error = null;

    try {
      const result = await getPublicSongSet(setId);
      if (result.data) {
        collection = result.data;
      } else {
        error = 'Collection not found or is no longer shared.';
      }
    } catch (err) {
      console.error('Failed to load shared collection:', err);
      error = 'Failed to load collection.';
    } finally {
      loading = false;
    }
  }

  // Order songs by the collection's song_ids ordering
  const orderedSongs = $derived.by(() => {
    if (!collection) return [];
    const songMap = new Map(collection.songs.map(s => [s.id, s]));
    return collection.song_ids
      .map(id => songMap.get(id))
      .filter((s): s is SupabaseSong => s != null);
  });
</script>

<div class="shared-page">
  <header class="shared-header">
    <a href="/" class="logo">Gigwidget</a>
    <a href="/browse" class="browse-link">Browse Songs</a>
  </header>

  {#if loading}
    <div class="center-message">
      <div class="spinner"></div>
      <p>Loading collection...</p>
    </div>
  {:else if error}
    <div class="center-message">
      <h2>Not Available</h2>
      <p>{error}</p>
      <a href="/browse" class="btn btn-primary">Browse Songs</a>
    </div>
  {:else if collection}
    <div class="collection-container">
      <div class="collection-meta">
        <h1 class="collection-title">{collection.name}</h1>
        {#if collection.description}
          <p class="collection-description">{collection.description}</p>
        {/if}
        <p class="collection-count">{orderedSongs.length} song{orderedSongs.length !== 1 ? 's' : ''}</p>
      </div>

      <div class="song-list">
        {#each orderedSongs as song, i}
          <a href="/shared/song/{song.id}?from=collection&collectionId={collection.id}&collectionName={encodeURIComponent(collection.name)}" class="song-item">
            <span class="song-number">{i + 1}</span>
            <div class="song-info">
              <span class="song-title">{song.title}</span>
              {#if song.artist}
                <span class="song-artist">{song.artist}</span>
              {/if}
            </div>
            {#if song.key}
              <span class="song-key">{song.key}</span>
            {/if}
          </a>
        {/each}
      </div>

      {#if orderedSongs.length === 0}
        <div class="center-message">
          <p>This collection has no songs.</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .shared-page {
    min-height: 100vh;
    background: var(--color-bg);
    color: var(--color-text);
  }

  .shared-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .logo {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-primary);
    text-decoration: none;
  }

  .browse-link {
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.875rem;
  }

  .browse-link:hover {
    color: var(--color-text);
  }

  .center-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 1.5rem;
    gap: 1rem;
    text-align: center;
  }

  .center-message h2 {
    font-size: 1.5rem;
    margin: 0;
  }

  .center-message p {
    color: var(--color-text-muted);
    margin: 0;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .collection-container {
    max-width: 700px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .collection-meta {
    margin-bottom: 1.5rem;
  }

  .collection-title {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0 0 0.25rem;
  }

  .collection-description {
    color: var(--color-text-muted);
    margin: 0 0 0.5rem;
  }

  .collection-count {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .song-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .song-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--color-text);
    transition: background 0.15s;
  }

  .song-item:hover {
    background: var(--color-bg-hover);
  }

  .song-number {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    min-width: 1.5rem;
    text-align: right;
  }

  .song-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .song-info .song-title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .song-info .song-artist {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .song-key {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    .collection-container {
      padding: 1rem;
    }

    .collection-title {
      font-size: 1.35rem;
    }
  }
</style>
