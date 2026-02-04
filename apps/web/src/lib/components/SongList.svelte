<script lang="ts">
  import type { Song } from '@gigwidget/core';

  interface Props {
    songs: Song[];
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onSelectionChange?: (selectedIds: Set<string>) => void;
    loading?: boolean;
    selectionEnabled?: boolean;
  }

  let {
    songs,
    selectedId = null,
    onSelect,
    onSelectionChange,
    loading = false,
    selectionEnabled = true
  }: Props = $props();

  // Sorting state
  let sortColumn = $state<'title' | 'artist' | 'key' | 'updatedAt'>('updatedAt');
  let sortDirection = $state<'asc' | 'desc'>('desc');

  // Search state
  let searchQuery = $state('');

  // Multi-selection state
  let selectedIds = $state<Set<string>>(new Set());
  let selectionMode = $state(false);
  let lastSelectedIndex = $state<number | null>(null);

  // Long-press state for mobile
  let longPressTimer: number | null = null;
  let longPressTriggered = $state(false);

  // Derived: is anything selected?
  let hasSelection = $derived(selectedIds.size > 0);

  // Notify parent when selection changes
  $effect(() => {
    if (selectionMode || hasSelection) {
      onSelectionChange?.(selectedIds);
    }
  });

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

  function toggleSelection(songId: string, index: number, shiftKey = false) {
    const newSet = new Set(selectedIds);

    // Shift+click for range selection
    if (shiftKey && lastSelectedIndex !== null && selectionMode) {
      const songs = filteredSongs();
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        newSet.add(songs[i].id);
      }
    } else {
      // Toggle single item
      if (newSet.has(songId)) {
        newSet.delete(songId);
      } else {
        newSet.add(songId);
      }
    }

    selectedIds = newSet;
    lastSelectedIndex = index;

    // Enter selection mode if we have selections
    if (newSet.size > 0) {
      selectionMode = true;
    }
  }

  function handleClick(e: MouseEvent, song: Song, index: number) {
    // If in selection mode, toggle selection
    if (selectionMode) {
      e.preventDefault();
      toggleSelection(song.id, index, e.shiftKey);
      return;
    }

    // Ctrl/Cmd+Click enters selection mode
    if (selectionEnabled && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      toggleSelection(song.id, index);
      return;
    }

    // Normal click - open the song
    onSelect?.(song.id);
  }

  function handlePointerDown(e: PointerEvent, song: Song, index: number) {
    // Only handle touch for long-press
    if (e.pointerType !== 'touch' || !selectionEnabled) return;

    longPressTriggered = false;
    longPressTimer = window.setTimeout(() => {
      longPressTriggered = true;
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      // Enter selection mode and select this item
      toggleSelection(song.id, index);
    }, 500);
  }

  function handlePointerUp() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handlePointerLeave() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleTouchClick(e: MouseEvent, song: Song, index: number) {
    // If long-press was triggered, don't also handle the click
    if (longPressTriggered) {
      e.preventDefault();
      longPressTriggered = false;
      return;
    }
    handleClick(e, song, index);
  }

  export function clearSelection() {
    selectedIds = new Set();
    selectionMode = false;
    lastSelectedIndex = null;
    onSelectionChange?.(selectedIds);
  }

  export function selectAll() {
    const allIds = new Set(filteredSongs().map(s => s.id));
    selectedIds = allIds;
    selectionMode = true;
    onSelectionChange?.(selectedIds);
  }

  export function getSelectedIds(): string[] {
    return Array.from(selectedIds);
  }

  function handleCheckboxClick(e: MouseEvent, song: Song, index: number) {
    e.stopPropagation();
    toggleSelection(song.id, index, e.shiftKey);
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

<div class="song-list" class:selection-mode={selectionMode}>
  <!-- Selection toolbar -->
  {#if hasSelection}
    <div class="selection-toolbar">
      <div class="selection-info">
        <button class="cancel-btn" onclick={clearSelection} title="Cancel selection">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <span class="selection-count">{selectedIds.size} selected</span>
      </div>
      <div class="selection-actions">
        <button class="select-all-btn" onclick={selectAll} title="Select all">
          Select All
        </button>
        <slot name="selection-actions" />
      </div>
    </div>
  {/if}

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
      {#if searchQuery}
        <button class="clear-search" onclick={() => searchQuery = ''} title="Clear search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div class="list-table">
    <div class="table-header">
      {#if selectionEnabled}
        <div class="header-cell checkbox-cell">
          <!-- Empty header for checkbox column -->
        </div>
      {/if}
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
        {#each filteredSongs() as song, index (song.id)}
          <button
            class="table-row"
            class:selected={selectedId === song.id}
            class:multi-selected={selectedIds.has(song.id)}
            onclick={(e) => handleTouchClick(e, song, index)}
            onpointerdown={(e) => handlePointerDown(e, song, index)}
            onpointerup={handlePointerUp}
            onpointerleave={handlePointerLeave}
            onpointercancel={handlePointerUp}
          >
            {#if selectionEnabled}
              <div class="cell checkbox-cell">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="checkbox"
                  class:checked={selectedIds.has(song.id)}
                  onclick={(e) => handleCheckboxClick(e, song, index)}
                >
                  {#if selectedIds.has(song.id)}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  {/if}
                </div>
              </div>
            {/if}
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

  /* Selection toolbar */
  .selection-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-primary);
    color: white;
    flex-shrink: 0;
  }

  .selection-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    color: white;
    transition: background-color var(--transition-fast);
  }

  .cancel-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }

  .selection-count {
    font-weight: 500;
    font-size: 0.9375rem;
  }

  .selection-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .select-all-btn {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background-color var(--transition-fast);
  }

  .select-all-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
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

  .clear-search {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xs);
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .clear-search:hover {
    color: var(--color-text);
    background-color: var(--color-surface);
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

  .checkbox-cell {
    width: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
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
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }

  .table-row:hover {
    background-color: var(--color-bg-secondary);
  }

  .table-row.selected {
    background-color: var(--color-surface);
  }

  .table-row.multi-selected {
    background-color: rgba(233, 69, 96, 0.1);
  }

  .table-row.multi-selected:hover {
    background-color: rgba(233, 69, 96, 0.15);
  }

  .cell {
    padding: var(--spacing-sm);
    font-size: 0.875rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }

  /* Checkbox styling */
  .checkbox {
    width: 18px;
    height: 18px;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition-fast);
    background-color: transparent;
  }

  .checkbox:hover {
    border-color: var(--color-primary);
  }

  .checkbox.checked {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  /* Show checkbox on hover in normal mode, always show in selection mode */
  .song-list:not(.selection-mode) .checkbox {
    opacity: 0;
  }

  .song-list:not(.selection-mode) .table-row:hover .checkbox {
    opacity: 1;
  }

  .song-list.selection-mode .checkbox {
    opacity: 1;
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

    /* Always show checkboxes on mobile in selection mode */
    .song-list.selection-mode .checkbox {
      opacity: 1;
    }
  }
</style>
