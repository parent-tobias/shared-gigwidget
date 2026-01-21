<script lang="ts">
  import { browser } from '$app/environment';
  import type { SongSet, Song } from '@gigwidget/core';

  let sets = $state<SongSet[]>([]);
  let songs = $state<Song[]>([]);
  let loading = $state(true);
  let hasLoaded = false;
  let showCreateModal = $state(false);
  let newSetName = $state('');
  let newSetDescription = $state('');
  let newSetIsSetlist = $state(false);
  let creating = $state(false);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadData();
  });

  async function loadData() {
    try {
      const { SongSetRepository, SongRepository, getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      const users = await db.users.toArray();
      if (users.length > 0) {
        sets = await SongSetRepository.getByUser(users[0].id);
        songs = await SongRepository.getByOwner(users[0].id);
      }
    } catch (err) {
      console.error('Failed to load sets:', err);
    } finally {
      loading = false;
    }
  }

  async function createSet() {
    if (!newSetName.trim()) return;

    creating = true;
    try {
      const { SongSetRepository, getDatabase } = await import('@gigwidget/db');
      const { generateId } = await import('@gigwidget/core');
      const db = getDatabase();

      const users = await db.users.toArray();
      if (users.length === 0) return;

      const newSet: SongSet = {
        id: generateId(),
        userId: users[0].id,
        name: newSetName.trim(),
        description: newSetDescription.trim() || undefined,
        songIds: [],
        isSetlist: newSetIsSetlist,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await SongSetRepository.create(newSet);
      sets = [...sets, newSet];

      // Reset form
      newSetName = '';
      newSetDescription = '';
      newSetIsSetlist = false;
      showCreateModal = false;
    } catch (err) {
      console.error('Failed to create set:', err);
    } finally {
      creating = false;
    }
  }

  async function deleteSet(setId: string) {
    if (!confirm('Delete this set? Songs will not be deleted.')) return;

    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      await SongSetRepository.delete(setId);
      sets = sets.filter((s) => s.id !== setId);
    } catch (err) {
      console.error('Failed to delete set:', err);
    }
  }

  function getSongCount(set: SongSet): number {
    return set.songIds.length;
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
  <title>Song Sets - Gigwidget</title>
</svelte:head>

<main class="container">
  <header class="page-header">
    <div class="header-left">
      <a href="/" class="back-link">← Home</a>
      <h1>Song Sets</h1>
      <p class="subtitle">Organize your songs into collections and setlists</p>
    </div>
    <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>+ New Set</button>
  </header>

  {#if loading}
    <div class="loading">Loading sets...</div>
  {:else if sets.length === 0}
    <div class="empty-state">
      <p>No sets yet. Create a set to organize your songs!</p>
      <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>Create Set</button>
    </div>
  {:else}
    <div class="sets-grid">
      {#each sets as set (set.id)}
        <div class="set-card" class:setlist={set.isSetlist}>
          <div class="set-header">
            <h3 class="set-name">{set.name}</h3>
            {#if set.isSetlist}
              <span class="setlist-badge">Setlist</span>
            {/if}
          </div>
          {#if set.description}
            <p class="set-description">{set.description}</p>
          {/if}
          <div class="set-meta">
            <span class="song-count">{getSongCount(set)} song{getSongCount(set) !== 1 ? 's' : ''}</span>
            <span class="set-date">Updated {formatDate(set.updatedAt)}</span>
          </div>
          <div class="set-actions">
            <a href="/sets/{set.id}" class="btn btn-secondary btn-sm">View</a>
            <button class="btn btn-danger btn-sm" onclick={() => deleteSet(set.id)}>Delete</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</main>

{#if showCreateModal}
  <div class="modal-overlay" onclick={() => (showCreateModal = false)}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Create New Set</h2>
      <form onsubmit={(e) => { e.preventDefault(); createSet(); }}>
        <div class="form-group">
          <label for="set-name">Name *</label>
          <input
            type="text"
            id="set-name"
            bind:value={newSetName}
            placeholder="e.g., Jazz Standards, Friday Gig"
            required
            disabled={creating}
          />
        </div>

        <div class="form-group">
          <label for="set-description">Description</label>
          <textarea
            id="set-description"
            bind:value={newSetDescription}
            placeholder="Optional description..."
            rows="2"
            disabled={creating}
          ></textarea>
        </div>

        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" bind:checked={newSetIsSetlist} disabled={creating} />
            This is a setlist (ordered for performance)
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick={() => (showCreateModal = false)} disabled={creating}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={creating || !newSetName.trim()}>
            {creating ? 'Creating...' : 'Create Set'}
          </button>
        </div>
      </form>
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

  .subtitle {
    color: var(--color-text-muted);
    font-size: 0.875rem;
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
    margin-top: var(--spacing-xl);
  }

  .empty-state p {
    color: var(--color-text-muted);
  }

  .sets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--spacing-md);
    padding: var(--spacing-lg) 0;
  }

  .set-card {
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    transition: background-color var(--transition-fast);
  }

  .set-card:hover {
    background-color: var(--color-surface);
  }

  .set-card.setlist {
    border-left: 3px solid var(--color-primary);
  }

  .set-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .set-name {
    font-size: 1.1rem;
    font-weight: 500;
    margin: 0;
  }

  .setlist-badge {
    background-color: var(--color-primary);
    color: white;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .set-description {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: 0;
  }

  .set-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .set-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.75rem;
  }

  .btn-danger {
    background-color: transparent;
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
  }

  .btn-danger:hover {
    background-color: var(--color-primary);
    color: white;
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
    max-width: 400px;
  }

  .modal h2 {
    margin: 0 0 var(--spacing-lg);
  }

  .form-group {
    margin-bottom: var(--spacing-md);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--spacing-xs);
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }

  .checkbox-group input[type='checkbox'] {
    width: auto;
  }

  textarea {
    resize: vertical;
    min-height: 60px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
  }
</style>
