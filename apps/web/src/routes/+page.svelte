<script lang="ts">
  import { browser } from '$app/environment';
  import type { User, Song } from '@gigwidget/core';

  let user = $state<User | null>(null);
  let songs = $state<Song[]>([]);
  let loading = $state(true);
  let hasLoaded = false;

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;

    (async () => {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      // Load user
      const users = await db.users.toArray();
      if (users.length > 0) {
        user = users[0];
      }

      // Load songs
      if (user) {
        songs = await db.songs.where({ ownerId: user.id }).toArray();
      }

      loading = false;
    })();
  });
</script>

<svelte:head>
  <title>Gigwidget - Local-First TAB Sharing</title>
</svelte:head>

<main class="container">
  <header class="header">
    <h1>Gigwidget</h1>
    {#if user}
      <span class="user-badge">{user.displayName}</span>
    {/if}
  </header>

  <section class="hero">
    <h2>Your Music, Your Way</h2>
    <p>Local-first TAB and chord sharing for musicians.</p>
  </section>

  {#if loading}
    <div class="loading">Loading your library...</div>
  {:else}
    <section class="library">
      <div class="library-header">
        <h3>My Library</h3>
        <a href="/songs/new" class="btn btn-primary">+ New Song</a>
      </div>

      {#if songs.length === 0}
        <div class="empty-state">
          <p>No songs yet. Create your first song to get started!</p>
          <a href="/songs/new" class="btn btn-primary" style="margin-top: var(--spacing-md)">Create Song</a>
        </div>
      {:else}
        <ul class="song-list">
          {#each songs.slice(0, 5) as song}
            <li class="song-item">
              <a href="/songs/{song.id}" class="song-link">
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
            </li>
          {/each}
        </ul>
        {#if songs.length > 5}
          <a href="/songs" class="view-all-link">View all {songs.length} songs →</a>
        {:else}
          <a href="/songs" class="view-all-link">View all songs →</a>
        {/if}
      {/if}
    </section>

    <section class="quick-links">
      <a href="/sets" class="quick-link-card">
        <span class="quick-link-icon">📁</span>
        <span class="quick-link-title">Song Sets</span>
        <span class="quick-link-desc">Organize songs into collections</span>
      </a>
      <a href="/instruments" class="quick-link-card">
        <span class="quick-link-icon">🎸</span>
        <span class="quick-link-title">Instruments</span>
        <span class="quick-link-desc">Custom tunings & instruments</span>
      </a>
      <a href="/import" class="quick-link-card">
        <span class="quick-link-icon">📥</span>
        <span class="quick-link-title">Import Songs</span>
        <span class="quick-link-desc">Search & import from ozbcoz.com</span>
      </a>
    </section>

    <section class="actions">
      <a href="/session" class="btn btn-secondary">Start or Join Session</a>
    </section>
  {/if}
</main>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-lg) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .user-badge {
    background-color: var(--color-surface);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
  }

  .hero {
    text-align: center;
    padding: var(--spacing-xl) 0;
  }

  .hero h2 {
    margin-bottom: var(--spacing-sm);
  }

  .hero p {
    color: var(--color-text-muted);
  }

  .library {
    margin-top: var(--spacing-xl);
  }

  .library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-xl);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
  }

  .song-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .song-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md);
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
    width: 100%;
    color: inherit;
    text-decoration: none;
  }

  .view-all-link {
    display: block;
    text-align: center;
    padding: var(--spacing-md);
    color: var(--color-primary);
    font-size: 0.875rem;
  }

  .view-all-link:hover {
    text-decoration: underline;
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

  .quick-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--spacing-md);
    margin-top: var(--spacing-xl);
  }

  .quick-link-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-lg);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    text-decoration: none;
    color: inherit;
    transition: background-color var(--transition-fast);
  }

  .quick-link-card:hover {
    background-color: var(--color-surface);
  }

  .quick-link-icon {
    font-size: 2rem;
    margin-bottom: var(--spacing-sm);
  }

  .quick-link-title {
    font-weight: 500;
    margin-bottom: var(--spacing-xs);
  }

  .quick-link-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-align: center;
  }

  .actions {
    display: flex;
    gap: var(--spacing-md);
    justify-content: center;
    margin-top: var(--spacing-xl);
    padding-top: var(--spacing-xl);
    border-top: 1px solid var(--color-border);
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }
</style>
