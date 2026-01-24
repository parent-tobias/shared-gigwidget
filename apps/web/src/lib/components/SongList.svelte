<script lang="ts">
  import type { Song } from '@gigwidget/core';

  interface Props {
    songs: Song[];
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    loading?: boolean;
  }

  let { songs, selectedId = null, onSelect, loading = false }: Props = $props();

  // Sorting state
  let sortColumn = $state<'title' | 'artist' | 'key' | 'updatedAt'>('updatedAt');
  let sortDirection = $state<'asc' | 'desc'>('desc');

  // Search state
  let searchQuery = $state('');

  // Filtered and sorted songs
  let filteredSongs = $derived(() => {
    let result = [...songs];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (song) =>
          song.title.toLowerCase().includes(query) ||
          (song.artist && song.artist.toLowerCase().includes(query)) ||
          (song.tags && song.tags.some((tag) => tag.toLowerCase().includes(query)))
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'artist':
          comparison = (a.artist || '').localeCompare(b.artist || '');
          break;
        case 'key':
          comparison = (a.key || '').localeCompare(b.key || '');
          break;
        case 'updatedAt':
          comparison = (a.updatedAt?.getTime() || 0) - (b.updatedAt?.getTime() || 0);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  });

  function toggleSort(column: typeof sortColumn) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = column === 'updatedAt' ? 'desc' : 'asc';
    }
  }

  function handleSelect(id: string) {
    onSelect?.(id);
  }

  function formatDate(date: Date | undefined): string {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return date.toLocaleDateString();
  }

  function getSortIcon(column: typeof sortColumn): string {
    if (sortColumn !== column) return '';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  }
</script>

<div class="song-list">
  <div class="list-header">
    <div class="search-bar">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        placeholder="Search songs..."
        bind:value={searchQuery}
      />
    </div>
  </div>

  <div class="list-table">
    <div class="table-header">
      <button class="header-cell title-cell" onclick={() => toggleSort('title')}>
        Title{getSortIcon('title')}
      </button>
      <button class="header-cell artist-cell" onclick={() => toggleSort('artist')}>
        Artist{getSortIcon('artist')}
      </button>
      <button class="header-cell key-cell" onclick={() => toggleSort('key')}>
        Key{getSortIcon('key')}
      </button>
      <button class="header-cell date-cell" onclick={() => toggleSort('updatedAt')}>
        Updated{getSortIcon('updatedAt')}
      </button>
    </div>

    <div class="table-body">
      {#if loading}
        <div class="loading-state">Loading songs...</div>
      {:else if filteredSongs().length === 0}
        <div class="empty-state">
          {#if searchQuery}
            <p>No songs match "{searchQuery}"</p>
          {:else}
            <p>No songs yet</p>
            <p class="hint">Create your first song to get started</p>
          {/if}
        </div>
      {:else}
        {#each filteredSongs() as song (song.id)}
          <button
            class="table-row"
            class:selected={selectedId === song.id}
            onclick={() => handleSelect(song.id)}
          >
            <div class="cell title-cell">
              <span class="song-title">{song.title}</span>
              {#if song.tags && song.tags.length > 0}
                <div class="tags">
                  {#each song.tags.slice(0, 2) as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                  {#if song.tags.length > 2}
                    <span class="tag more">+{song.tags.length - 2}</span>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="cell artist-cell">{song.artist || '-'}</div>
            <div class="cell key-cell">{song.key || '-'}</div>
            <div class="cell date-cell">{formatDate(song.updatedAt)}</div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .song-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-bg);
  }

  .list-header {
    padding: var(--spacing-sm);
    border-bottom: 1px solid var(--color-border);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-xs) var(--spacing-sm);
  }

  .search-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .search-bar input {
    flex: 1;
    border: none;
    background: none;
    padding: var(--spacing-xs);
    color: var(--color-text);
    font-size: 0.875rem;
  }

  .search-bar input:focus {
    outline: none;
  }

  .search-bar input::placeholder {
    color: var(--color-text-muted);
  }

  .list-table {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .table-header {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg-secondary);
    flex-shrink: 0;
  }

  .header-cell {
    padding: var(--spacing-sm) var(--spacing-sm);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-align: left;
    white-space: nowrap;
    transition: color var(--transition-fast);
  }

  .header-cell:hover {
    color: var(--color-text);
  }

  .table-body {
    flex: 1;
    overflow-y: auto;
  }

  .table-row {
    display: flex;
    width: 100%;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    transition: background-color var(--transition-fast);
  }

  .table-row:hover {
    background-color: var(--color-bg-secondary);
  }

  .table-row.selected {
    background-color: var(--color-surface);
  }

  .cell {
    padding: var(--spacing-sm);
    font-size: 0.875rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }

  .title-cell {
    flex: 2;
    min-width: 120px;
  }

  .artist-cell {
    flex: 1;
    min-width: 80px;
    color: var(--color-text-muted);
  }

  .key-cell {
    width: 50px;
    flex-shrink: 0;
    text-align: center;
    font-family: var(--font-family-mono);
    font-size: 0.8125rem;
  }

  .date-cell {
    width: 80px;
    flex-shrink: 0;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
  }

  .song-title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tags {
    display: flex;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
    flex-wrap: wrap;
  }

  .tag {
    padding: 2px 6px;
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
    font-size: 0.6875rem;
    color: var(--color-text-muted);
  }

  .tag.more {
    background-color: var(--color-border);
  }

  .loading-state,
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

  /* Hide columns on smaller widths */
  @media (max-width: 600px) {
    .artist-cell,
    .date-cell {
      display: none;
    }

    .key-cell {
      width: 40px;
    }
  }
</style>
