<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import type { User } from '@gigwidget/core';
  import type { OzbcozSearchResult, OzbcozSongDetail } from '@gigwidget/core';

  let user = $state<User | null>(null);
  let searchQuery = $state('');
  let searchResults = $state<OzbcozSearchResult[]>([]);
  let selectedSong = $state<OzbcozSongDetail | null>(null);
  let isSearching = $state(false);
  let isLoadingDetails = $state(false);
  let isImporting = $state(false);
  let error = $state<string | null>(null);
  let importSuccess = $state<string | null>(null);
  let hasInitialized = false;

  // Scraper functions loaded dynamically
  let searchOzbcozSongs: typeof import('@gigwidget/core').searchOzbcozSongs;
  let getOzbcozSongDetail: typeof import('@gigwidget/core').getOzbcozSongDetail;

  $effect(() => {
    if (!browser || hasInitialized) return;
    hasInitialized = true;

    (async () => {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      // Load user
      const users = await db.users.toArray();
      if (users.length > 0) {
        user = users[0];
      }

      // Load scraper functions
      const core = await import('@gigwidget/core');
      searchOzbcozSongs = core.searchOzbcozSongs;
      getOzbcozSongDetail = core.getOzbcozSongDetail;
    })();
  });

  async function handleSearch() {
    if (!searchQuery.trim() || !searchOzbcozSongs) return;

    isSearching = true;
    error = null;
    selectedSong = null;
    importSuccess = null;

    try {
      searchResults = await searchOzbcozSongs(searchQuery);
      if (searchResults.length === 0) {
        error = `No songs found for "${searchQuery}"`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Search failed';
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }

  async function loadSongDetails(result: OzbcozSearchResult) {
    if (!getOzbcozSongDetail) return;

    isLoadingDetails = true;
    error = null;

    try {
      selectedSong = await getOzbcozSongDetail(result.id);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load song details';
      selectedSong = null;
    } finally {
      isLoadingDetails = false;
    }
  }

  async function importSong() {
    if (!selectedSong || !user) return;

    isImporting = true;
    error = null;

    try {
      const { getDatabase } = await import('@gigwidget/db');
      const { createSong, createArrangement } = await import('@gigwidget/core');
      const db = getDatabase();

      // Create the song
      const song = createSong(user.id, selectedSong.title, {
        artist: selectedSong.artist || selectedSong.writer,
        key: selectedSong.key as any,
        tempo: selectedSong.tempo,
        tags: ['imported', 'ozbcoz'],
      });

      // Create default arrangement with the content
      const arrangement = createArrangement(song.id, 'ukulele', {
        content: selectedSong.content,
      });

      // Save to database
      await db.songs.add(song);
      await db.arrangements.add(arrangement);

      importSuccess = `Successfully imported "${selectedSong.title}"`;

      // Reset after short delay
      setTimeout(() => {
        goto(`/songs/${song.id}`);
      }, 1500);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Import failed';
    } finally {
      isImporting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }

  function clearSelection() {
    selectedSong = null;
    error = null;
  }
</script>

<svelte:head>
  <title>Import Songs - Gigwidget</title>
</svelte:head>

<main class="container">
  <header class="header">
    <a href="/" class="back-link">&larr; Back</a>
    <h1>Import from ozbcoz.com</h1>
  </header>

  <section class="search-section">
    <p class="description">
      Search the ozbcoz.com ukulele songbook for ChordPro songs to import into your library.
    </p>

    <div class="search-box">
      <input
        type="text"
        bind:value={searchQuery}
        onkeydown={handleKeydown}
        placeholder="Search by song title or artist..."
        class="search-input"
        disabled={isSearching}
      />
      <button
        onclick={handleSearch}
        class="btn btn-primary"
        disabled={isSearching || !searchQuery.trim()}
      >
        {isSearching ? 'Searching...' : 'Search'}
      </button>
    </div>
  </section>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if importSuccess}
    <div class="success-message">{importSuccess}</div>
  {/if}

  {#if selectedSong}
    <section class="preview-section">
      <div class="preview-header">
        <h2>{selectedSong.title}</h2>
        <button onclick={clearSelection} class="btn btn-secondary btn-small">Back to Results</button>
      </div>

      {#if selectedSong.artist}
        <p class="preview-meta">Artist: {selectedSong.artist}</p>
      {/if}
      {#if selectedSong.writer && selectedSong.writer !== selectedSong.artist}
        <p class="preview-meta">Writer: {selectedSong.writer}</p>
      {/if}
      {#if selectedSong.key}
        <p class="preview-meta">Key: {selectedSong.key}</p>
      {/if}
      {#if selectedSong.tempo}
        <p class="preview-meta">Tempo: {selectedSong.tempo} BPM</p>
      {/if}

      <div class="preview-content">
        <h3>ChordPro Content</h3>
        <pre class="chordpro-preview">{selectedSong.content}</pre>
      </div>

      <div class="import-actions">
        <button
          onclick={importSong}
          class="btn btn-primary"
          disabled={isImporting || !user}
        >
          {isImporting ? 'Importing...' : 'Import to Library'}
        </button>
        {#if selectedSong.youtubeUrl}
          <a href={selectedSong.youtubeUrl} target="_blank" rel="noopener" class="btn btn-secondary">
            View on YouTube
          </a>
        {/if}
      </div>
    </section>
  {:else if searchResults.length > 0}
    <section class="results-section">
      <h2>Search Results ({searchResults.length})</h2>
      <ul class="results-list">
        {#each searchResults as result}
          <li class="result-item">
            <button onclick={() => loadSongDetails(result)} class="result-button" disabled={isLoadingDetails}>
              <span class="result-title">{result.title}</span>
              {#if result.artist}
                <span class="result-artist">{result.artist}</span>
              {/if}
              {#if result.key}
                <span class="result-key">{result.key}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {:else if !isSearching && searchQuery}
    <p class="no-results">No results yet. Click Search to find songs.</p>
  {/if}

  {#if isLoadingDetails}
    <div class="loading-overlay">
      <div class="loading-spinner">Loading song details...</div>
    </div>
  {/if}
</main>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-lg) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .back-link {
    color: var(--color-primary);
    text-decoration: none;
    font-size: 0.875rem;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .description {
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-md);
  }

  .search-section {
    margin-top: var(--spacing-xl);
  }

  .search-box {
    display: flex;
    gap: var(--spacing-sm);
  }

  .search-input {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
    background-color: var(--color-bg-secondary);
    color: var(--color-text);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .error-message {
    margin-top: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: var(--radius-md);
    color: #dc3545;
  }

  .success-message {
    margin-top: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: rgba(40, 167, 69, 0.1);
    border: 1px solid rgba(40, 167, 69, 0.3);
    border-radius: var(--radius-md);
    color: #28a745;
  }

  .results-section {
    margin-top: var(--spacing-xl);
  }

  .results-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
  }

  .result-item {
    display: block;
  }

  .result-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    width: 100%;
    padding: var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .result-button:hover:not(:disabled) {
    background-color: var(--color-surface);
  }

  .result-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .result-title {
    flex: 1;
    font-weight: 500;
    color: var(--color-text);
  }

  .result-artist {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .result-key {
    background-color: var(--color-secondary);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .preview-section {
    margin-top: var(--spacing-xl);
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  .preview-meta {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin-bottom: var(--spacing-xs);
  }

  .preview-content {
    margin-top: var(--spacing-lg);
  }

  .preview-content h3 {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-sm);
  }

  .chordpro-preview {
    background-color: var(--color-bg-secondary);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    overflow-x: auto;
    font-family: monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .import-actions {
    display: flex;
    gap: var(--spacing-md);
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .btn-small {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.875rem;
  }

  .no-results {
    text-align: center;
    color: var(--color-text-muted);
    margin-top: var(--spacing-xl);
  }

  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .loading-spinner {
    background-color: var(--color-surface);
    padding: var(--spacing-lg) var(--spacing-xl);
    border-radius: var(--radius-lg);
    color: var(--color-text);
  }
</style>
