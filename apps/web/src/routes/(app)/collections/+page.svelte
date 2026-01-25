<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import type { SongSet } from '@gigwidget/core';

  let sets = $state<SongSet[]>([]);
  let loading = $state(true);
  let hasLoaded = false;

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadSets();
  });

  async function loadSets() {
    try {
      const { SongSetRepository, getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      // Get current user
      const users = await db.users.toArray();
      if (users.length > 0) {
        sets = await SongSetRepository.getByUser(users[0].id);
      }
    } catch (err) {
      console.error('Failed to load collections:', err);
    } finally {
      loading = false;
    }
  }

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
</script>

<svelte:head>
  <title>Collections - Gigwidget</title>
</svelte:head>

<div class="collections-page">
  <header class="page-header">
    <h1>Collections</h1>
    <a href="/sets/new" class="btn btn-primary">+ New Collection</a>
  </header>

  <div class="list-container">
    {#if loading}
      <div class="loading">Loading collections...</div>
    {:else if sets.length === 0}
      <div class="empty-state">
        <p>No collections yet</p>
        <p class="hint">Create a collection to organize your songs</p>
      </div>
    {:else}
      <div class="collection-list">
        {#each sets as set (set.id)}
          <a href="/sets/{set.id}" class="collection-item">
            <div class="collection-icon">
              {#if set.isSetlist}
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
            <div class="collection-info">
              <span class="collection-name">{set.name}</span>
              {#if set.isSetlist}
                <span class="setlist-badge">Setlist</span>
              {/if}
              <span class="collection-meta">
                {set.songIds.length} songs · Updated {formatDate(set.updatedAt)}
              </span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .collections-page {
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
    overflow-y: auto;
  }

  .loading,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
    text-align: center;
    height: 200px;
  }

  .empty-state .hint {
    font-size: 0.875rem;
    margin-top: var(--spacing-sm);
  }

  .collection-list {
    display: flex;
    flex-direction: column;
  }

  .collection-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    text-decoration: none;
    color: inherit;
    transition: background-color var(--transition-fast);
  }

  .collection-item:hover {
    background-color: var(--color-bg-secondary);
  }

  .collection-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background-color: var(--color-surface);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .collection-info {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    min-width: 0;
  }

  .collection-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .setlist-badge {
    display: inline-block;
    padding: 2px 8px;
    background-color: var(--color-primary);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    width: fit-content;
  }

  .collection-meta {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
</style>
