<script lang="ts">
  import { browser } from '$app/environment';
  import type { SongSet } from '@gigwidget/core';

  let sets = $state<SongSet[]>([]);
  let loading = $state(true);
  let hasLoaded = false;

  // Create modal state
  let showCreateModal = $state(false);
  let newSetName = $state('');
  let newSetDescription = $state('');
  let newSetIsSetlist = $state(false);
  let creating = $state(false);

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
        visibility: 'private', // Collections are private by default
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
      console.error('Failed to create collection:', err);
    } finally {
      creating = false;
    }
  }

  async function deleteSet(e: MouseEvent, setId: string) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm('Delete this collection? Songs will not be deleted.')) return;

    try {
      const { SongSetRepository } = await import('@gigwidget/db');
      await SongSetRepository.delete(setId);
      sets = sets.filter((s) => s.id !== setId);
    } catch (err) {
      console.error('Failed to delete collection:', err);
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
    <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>+ New</button>
  </header>

  <div class="list-container">
    {#if loading}
      <div class="loading">Loading collections...</div>
    {:else if sets.length === 0}
      <div class="empty-state">
        <p>No collections yet</p>
        <p class="hint">Create a collection to organize your songs into groups, or a setlist for ordered performances.</p>
        <button class="btn btn-primary" onclick={() => (showCreateModal = true)}>Create Collection</button>
      </div>
    {:else}
      <div class="collection-list">
        {#each sets as set (set.id)}
          <a href="/collections/{set.id}" class="collection-item">
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
              <div class="collection-header">
                <span class="collection-name">{set.name}</span>
                {#if set.isSetlist}
                  <span class="setlist-badge">Setlist</span>
                {/if}
              </div>
              <span class="collection-meta">
                {set.songIds.length} song{set.songIds.length !== 1 ? 's' : ''} · Updated {formatDate(set.updatedAt)}
              </span>
            </div>
            <button
              class="btn-delete"
              onclick={(e) => deleteSet(e, set.id)}
              title="Delete collection"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showCreateModal}
  <div class="modal-overlay" onclick={() => (showCreateModal = false)}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Create Collection</h2>
      <form onsubmit={(e) => { e.preventDefault(); createSet(); }}>
        <div class="form-group">
          <label for="set-name">Name</label>
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
          <label for="set-description">Description <span class="optional">(optional)</span></label>
          <textarea
            id="set-description"
            bind:value={newSetDescription}
            placeholder="What's this collection for?"
            rows="2"
            disabled={creating}
          ></textarea>
        </div>

        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={newSetIsSetlist} disabled={creating} />
            <span class="checkbox-text">
              <strong>Setlist</strong>
              <span class="checkbox-hint">Ordered for performance, with drag-to-reorder</span>
            </span>
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick={() => (showCreateModal = false)} disabled={creating}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={creating || !newSetName.trim()}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

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
    gap: var(--spacing-sm);
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
    text-align: center;
    height: 200px;
  }

  .empty-state .hint {
    font-size: 0.875rem;
    max-width: 300px;
    line-height: 1.4;
  }

  .empty-state .btn {
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
    flex: 1;
  }

  .collection-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
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
    flex-shrink: 0;
  }

  .collection-meta {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .btn-delete {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    opacity: 0;
    flex-shrink: 0;
  }

  .collection-item:hover .btn-delete {
    opacity: 1;
  }

  .btn-delete:hover {
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
    max-width: 400px;
  }

  .modal h2 {
    margin: 0 0 var(--spacing-lg);
    font-size: 1.125rem;
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
  }

  .checkbox-group {
    margin-top: var(--spacing-md);
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    margin-top: 2px;
  }

  .checkbox-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .checkbox-hint {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 400;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
  }
</style>
