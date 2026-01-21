<script lang="ts">
  import { browser } from '$app/environment';
  import type { Song } from '@gigwidget/core';

  let songs = $state<Song[]>([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let hasLoaded = false;

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;

    loadSongs();
  });

  async function loadSongs() {
    try {
      const { SongRepository } = await import('@gigwidget/db');
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      // Get current user
      const users = await db.users.toArray();
      if (users.length > 0) {
        songs = await SongRepository.getByOwner(users[0].id);
      }
    } catch (err) {
      console.error('Failed to load songs:', err);
    } finally {
      loading = false;
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      await loadSongs();
      return;
    }

    try {
      const { SongRepository } = await import('@gigwidget/db');
      songs = await SongRepository.search(searchQuery);
    } catch (err) {
      console.error('Failed to search songs:', err);
    }
  }

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }
</script>

<svelte:head>
  <title>My Songs - Gigwidget</title>
</svelte:head>

<main class="container">
  <header class="page-header">
    <div class="header-left">
      <a href="/" class="back-link">← Home</a>
      <h1>My Songs</h1>
    </div>
    <a href="/songs/new" class="btn btn-primary">+ New Song</a>
  </header>

  <section class="search-section">
    <div class="search-bar">
      <input
        type="search"
        placeholder="Search by title, artist, or tag..."
        bind:value={searchQuery}
        oninput={handleSearch}
      />
    </div>
  </section>

  {#if loading}
    <div class="loading">Loading songs...</div>
  {:else if songs.length === 0}
    <div class="empty-state">
      {#if searchQuery}
        <p>No songs found matching "{searchQuery}"</p>
        <button class="btn btn-secondary" onclick={() => { searchQuery = ''; loadSongs(); }}>
          Clear search
        </button>
      {:else}
        <p>No songs yet. Create your first song to get started!</p>
        <a href="/songs/new" class="btn btn-primary">Create Song</a>
      {/if}
    </div>
  {:else}
    <ul class="song-list">
      {#each songs as song (song.id)}
        <li class="song-item">
          <a href="/songs/{song.id}" class="song-link">
            <div class="song-info">
              <span class="song-title">{song.title}</span>
              {#if song.artist}
                <span class="song-artist">{song.artist}</span>
              {/if}
              <span class="song-date">Updated {formatDate(song.updatedAt)}</span>
            </div>
            <div class="song-meta">
              {#if song.key}
                <span class="song-key">{song.key}</span>
              {/if}
              {#if song.tempo}
                <span class="song-tempo">{song.tempo} BPM</span>
              {/if}
              {#if song.tags.length > 0}
                <div class="song-tags">
                  {#each song.tags.slice(0, 3) as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                  {#if song.tags.length > 3}
                    <span class="tag tag-more">+{song.tags.length - 3}</span>
                  {/if}
                </div>
              {/if}
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>

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
    gap: var(--spacing-sm);
  }

  .back-link {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  .search-section {
    padding: var(--spacing-lg) 0;
  }

  .search-bar input {
    width: 100%;
    max-width: 400px;
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
  }

  .empty-state p {
    color: var(--color-text-muted);
  }

  .song-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .song-item {
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast);
  }

  .song-item:hover {
    background-color: var(--color-surface);
  }

  .song-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md);
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
    font-size: 1.1rem;
  }

  .song-artist {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .song-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .song-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .song-key {
    background-color: var(--color-secondary);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .song-tempo {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .song-tags {
    display: flex;
    gap: var(--spacing-xs);
  }

  .tag {
    background-color: var(--color-surface);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  .tag-more {
    font-style: italic;
  }

  @media (max-width: 600px) {
    .song-link {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-sm);
    }

    .song-meta {
      flex-wrap: wrap;
    }
  }
</style>
