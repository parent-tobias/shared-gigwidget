<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import type { User } from '@gigwidget/core';
  import type { OzbcozSearchResult, OzbcozSongDetail } from '@gigwidget/core';

  let user = $state<User | null>(null);
  let activeTab = $state<'files' | 'ozbcoz'>('files');

  // Ozbcoz search state
  let searchQuery = $state('');
  let searchResults = $state<OzbcozSearchResult[]>([]);
  let selectedSong = $state<OzbcozSongDetail | null>(null);
  let isSearching = $state(false);
  let isLoadingDetails = $state(false);
  let isImporting = $state(false);
  let error = $state<string | null>(null);
  let importSuccess = $state<string | null>(null);
  let hasInitialized = false;

  // File import state
  interface ParsedFile {
    filename: string;
    path: string;
    title: string;
    artist: string;
    key?: string;
    tempo?: number;
    content: string;
    selected: boolean;
  }

  let parsedFiles = $state<ParsedFile[]>([]);
  let isParsingFiles = $state(false);
  let isImportingFiles = $state(false);
  let fileImportProgress = $state({ current: 0, total: 0 });
  let fileImportResults = $state<{ success: number; failed: number }>({ success: 0, failed: 0 });

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

  // ChordPro file extensions
  const CHORDPRO_EXTENSIONS = ['.chopro', '.chordpro', '.cho', '.crd', '.pro'];

  function isChordProFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return CHORDPRO_EXTENSIONS.some(ext => lower.endsWith(ext));
  }

  function parseChordProDirectives(content: string): { title: string; artist: string; key?: string; tempo?: number } {
    const lines = content.split('\n');
    let title = '';
    let artist = '';
    let key: string | undefined;
    let tempo: number | undefined;

    for (const line of lines) {
      const trimmed = line.trim();

      // Match directives like {title: ...} or {t: ...}
      const match = trimmed.match(/^\{(\w+):\s*(.+?)\}$/);
      if (match) {
        const [, directive, value] = match;
        const lowerDirective = directive.toLowerCase();

        if (lowerDirective === 'title' || lowerDirective === 't') {
          title = value.trim();
        } else if (lowerDirective === 'subtitle' || lowerDirective === 'st' || lowerDirective === 'artist') {
          artist = value.trim();
        } else if (lowerDirective === 'key') {
          key = value.trim();
        } else if (lowerDirective === 'tempo') {
          const parsed = parseInt(value.trim(), 10);
          if (!isNaN(parsed)) tempo = parsed;
        }
      }
    }

    return { title, artist, key, tempo };
  }

  async function handleDirectorySelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    isParsingFiles = true;
    error = null;
    parsedFiles = [];

    try {
      const newParsedFiles: ParsedFile[] = [];

      for (const file of Array.from(files)) {
        if (!isChordProFile(file.name)) continue;

        try {
          const content = await file.text();
          const { title, artist, key, tempo } = parseChordProDirectives(content);

          newParsedFiles.push({
            filename: file.name,
            path: file.webkitRelativePath || file.name,
            title: title || file.name.replace(/\.[^.]+$/, ''),
            artist: artist || 'Unknown Artist',
            key,
            tempo,
            content,
            selected: true,
          });
        } catch (err) {
          console.error(`Failed to parse ${file.name}:`, err);
        }
      }

      // Sort by artist, then title
      newParsedFiles.sort((a, b) => {
        const artistCompare = a.artist.localeCompare(b.artist);
        if (artistCompare !== 0) return artistCompare;
        return a.title.localeCompare(b.title);
      });

      parsedFiles = newParsedFiles;

      if (parsedFiles.length === 0) {
        error = 'No ChordPro files found in the selected directory.';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to parse files';
    } finally {
      isParsingFiles = false;
    }
  }

  function toggleFileSelection(index: number) {
    parsedFiles[index].selected = !parsedFiles[index].selected;
  }

  function selectAll() {
    parsedFiles = parsedFiles.map(f => ({ ...f, selected: true }));
  }

  function selectNone() {
    parsedFiles = parsedFiles.map(f => ({ ...f, selected: false }));
  }

  let selectedCount = $derived(parsedFiles.filter(f => f.selected).length);

  async function importSelectedFiles() {
    if (!user) return;

    const filesToImport = parsedFiles.filter(f => f.selected);
    if (filesToImport.length === 0) return;

    isImportingFiles = true;
    error = null;
    fileImportProgress = { current: 0, total: filesToImport.length };
    fileImportResults = { success: 0, failed: 0 };

    try {
      const { getDatabase } = await import('@gigwidget/db');
      const { createSong, createArrangement } = await import('@gigwidget/core');
      const db = getDatabase();

      for (let i = 0; i < filesToImport.length; i++) {
        const file = filesToImport[i];
        fileImportProgress = { current: i + 1, total: filesToImport.length };

        try {
          // Create the song
          const song = createSong(user.id, file.title, {
            artist: file.artist,
            key: file.key as any,
            tempo: file.tempo,
            tags: ['imported', 'file-import'],
            visibility: 'public',
          });

          // Create default arrangement
          const arrangement = createArrangement(song.id, 'guitar', {
            content: file.content,
          });

          // Save to database
          await db.songs.add(song);
          await db.arrangements.add(arrangement);

          fileImportResults.success++;
        } catch (err) {
          console.error(`Failed to import ${file.filename}:`, err);
          fileImportResults.failed++;
        }
      }

      // Clear imported files from the list
      parsedFiles = parsedFiles.filter(f => !f.selected);

      importSuccess = `Successfully imported ${fileImportResults.success} songs${fileImportResults.failed > 0 ? ` (${fileImportResults.failed} failed)` : ''}`;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Import failed';
    } finally {
      isImportingFiles = false;
    }
  }

  // Ozbcoz functions
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

  function cleanChordContent(content: string): string {
    return content.replace(/\]\s+(?=[^\s\n\]])/g, ']');
  }

  async function importSong() {
    if (!selectedSong || !user) return;

    isImporting = true;
    error = null;

    try {
      const { getDatabase } = await import('@gigwidget/db');
      const { createSong, createArrangement } = await import('@gigwidget/core');
      const db = getDatabase();

      const song = createSong(user.id, selectedSong.title, {
        artist: selectedSong.artist || selectedSong.writer,
        key: selectedSong.key as any,
        tempo: selectedSong.tempo,
        tags: ['imported', 'ozbcoz'],
        visibility: 'public',
      });

      const cleanedContent = cleanChordContent(selectedSong.content);
      const arrangement = createArrangement(song.id, 'ukulele', {
        content: cleanedContent,
      });

      await db.songs.add(song);
      await db.arrangements.add(arrangement);

      importSuccess = `Successfully imported "${selectedSong.title}"`;

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
    <h1>Import Songs</h1>
  </header>

  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'files'}
      onclick={() => { activeTab = 'files'; error = null; importSuccess = null; }}
    >
      From Files
    </button>
    <button
      class="tab"
      class:active={activeTab === 'ozbcoz'}
      onclick={() => { activeTab = 'ozbcoz'; error = null; importSuccess = null; }}
    >
      From ozbcoz.com
    </button>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if importSuccess}
    <div class="success-message">{importSuccess}</div>
  {/if}

  {#if activeTab === 'files'}
    <section class="import-section">
      <p class="description">
        Select a folder containing ChordPro files (.chopro, .chordpro, .cho, .crd, .pro).
        All files in the folder and subfolders will be scanned.
      </p>

      <div class="file-picker">
        <input
          type="file"
          id="directory-input"
          webkitdirectory
          multiple
          onchange={handleDirectorySelect}
          disabled={isParsingFiles || isImportingFiles}
          class="hidden-input"
        />
        <label for="directory-input" class="btn btn-primary">
          {isParsingFiles ? 'Scanning...' : 'Choose Folder'}
        </label>
      </div>

      {#if parsedFiles.length > 0}
        <div class="file-list-header">
          <h2>Found {parsedFiles.length} ChordPro files</h2>
          <div class="selection-controls">
            <button class="btn btn-secondary btn-small" onclick={selectAll}>Select All</button>
            <button class="btn btn-secondary btn-small" onclick={selectNone}>Select None</button>
          </div>
        </div>

        <div class="file-list">
          {#each parsedFiles as file, index (file.path)}
            <label class="file-item" class:selected={file.selected}>
              <input
                type="checkbox"
                checked={file.selected}
                onchange={() => toggleFileSelection(index)}
                disabled={isImportingFiles}
              />
              <div class="file-info">
                <span class="file-title">{file.title}</span>
                <span class="file-artist">{file.artist}</span>
              </div>
              <div class="file-meta">
                {#if file.key}
                  <span class="file-key">{file.key}</span>
                {/if}
                <span class="file-path" title={file.path}>{file.filename}</span>
              </div>
            </label>
          {/each}
        </div>

        <div class="import-actions">
          {#if isImportingFiles}
            <div class="progress-info">
              Importing {fileImportProgress.current} of {fileImportProgress.total}...
            </div>
          {:else}
            <button
              onclick={importSelectedFiles}
              class="btn btn-primary"
              disabled={selectedCount === 0 || !user}
            >
              Import {selectedCount} Selected Songs
            </button>
          {/if}
        </div>
      {/if}
    </section>
  {:else}
    <section class="import-section">
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
    </section>
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

  .tabs {
    display: flex;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .tab {
    padding: var(--spacing-sm) var(--spacing-lg);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tab:hover {
    color: var(--color-text);
  }

  .tab.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }

  .description {
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-md);
  }

  .import-section {
    margin-top: var(--spacing-lg);
  }

  /* File picker */
  .file-picker {
    margin-bottom: var(--spacing-lg);
  }

  .hidden-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .file-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  .file-list-header h2 {
    font-size: 1rem;
    font-weight: 600;
  }

  .selection-controls {
    display: flex;
    gap: var(--spacing-xs);
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-xs);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .file-item:hover {
    background-color: var(--color-surface);
  }

  .file-item.selected {
    background-color: rgba(233, 69, 96, 0.1);
  }

  .file-item input[type="checkbox"] {
    width: auto;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-artist {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  .file-key {
    background-color: var(--color-secondary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .file-path {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-info {
    color: var(--color-primary);
    font-weight: 500;
  }

  /* Search */
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

  @media (max-width: 768px) {
    .file-list-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-sm);
    }

    .file-item {
      flex-wrap: wrap;
    }

    .file-meta {
      width: 100%;
      margin-top: var(--spacing-xs);
      padding-left: calc(20px + var(--spacing-md));
    }

    .file-path {
      max-width: none;
    }
  }
</style>
