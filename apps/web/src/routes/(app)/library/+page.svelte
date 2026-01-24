<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import type { Song } from '@gigwidget/core';
  import SongList from '$lib/components/SongList.svelte';

  let songs = $state<Song[]>([]);
  let loading = $state(true);
  let hasLoaded = false;

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadSongs();
  });

  async function loadSongs() {
    try {
      const { SongRepository, getDatabase } = await import('@gigwidget/db');
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

  function handleSelectSong(id: string) {
    goto(`/library/${id}`);
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
      {songs}
      {loading}
      onSelect={handleSelectSong}
    />
  </div>
</div>

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
</style>
