<script lang="ts">
  import { browser } from '$app/environment';
  import type { User, SongSet } from '@gigwidget/core';
  let user = $state<User | null>(null);

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

  // Import options state
  let importTags = $state('');
  let collections = $state<SongSet[]>([]);
  let selectedCollectionId = $state<string>('none');
  let newCollectionName = $state('');

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

        // Load user collections for import options
        const { SongSetRepository } = await import('@gigwidget/db');
        collections = await SongSetRepository.getByUser(users[0].id);
      }

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

    if (selectedCollectionId === 'new' && !newCollectionName.trim()) {
      error = 'Please enter a name for the new collection.';
      return;
    }

    // Build tags: always include 'imported', plus user-defined tags
    const userTags = importTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t !== 'imported');
    const allTags = ['imported', ...userTags];

    isImportingFiles = true;
    error = null;
    fileImportProgress = { current: 0, total: filesToImport.length };
    fileImportResults = { success: 0, failed: 0 };

    try {
      const { getDatabase, SongSetRepository } = await import('@gigwidget/db');
      const { createSong, createArrangement, generateId } = await import('@gigwidget/core');
      const db = getDatabase();

      const importedSongIds: string[] = [];

      for (let i = 0; i < filesToImport.length; i++) {
        const file = filesToImport[i];
        fileImportProgress = { current: i + 1, total: filesToImport.length };

        try {
          // Create the song
          const song = createSong(user.id, file.title, {
            artist: file.artist,
            key: file.key as any,
            tempo: file.tempo,
            tags: allTags,
            visibility: 'public',
          });

          // Create default arrangement
          const arrangement = createArrangement(song.id, 'guitar', {
            content: file.content,
          });

          // Save to database
          await db.songs.add(song);
          await db.arrangements.add(arrangement);

          importedSongIds.push(song.id);
          fileImportResults.success++;
        } catch (err) {
          console.error(`Failed to import ${file.filename}:`, err);
          fileImportResults.failed++;
        }
      }

      // Add imported songs to collection if one was selected/created
      if (selectedCollectionId !== 'none' && importedSongIds.length > 0) {
        let targetSetId = selectedCollectionId;

        if (selectedCollectionId === 'new' && newCollectionName.trim()) {
          const newSet: SongSet = {
            id: generateId(),
            userId: user.id,
            name: newCollectionName.trim(),
            songIds: [],
            isSetlist: false,
            visibility: 'private',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await SongSetRepository.create(newSet);
          collections = [...collections, newSet];
          targetSetId = newSet.id;
        }

        for (const songId of importedSongIds) {
          await SongSetRepository.addSong(targetSetId, songId);
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

</script>

<svelte:head>
  <title>Import Songs - Gigwidget</title>
</svelte:head>

<main class="container">
  <header class="header">
    <h1>Import Songs</h1>
  </header>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if importSuccess}
    <div class="success-message">{importSuccess}</div>
  {/if}

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

        {#if selectedCount > 0}
          <div class="import-options">
            <h3>Import Options</h3>

            <div class="form-group">
              <label for="import-tags">Tags</label>
              <input
                type="text"
                id="import-tags"
                bind:value={importTags}
                placeholder="worship, classic, practice (comma-separated)"
                disabled={isImportingFiles}
              />
              <span class="help-text">The tag "imported" is always included automatically.</span>
            </div>

            <div class="form-group">
              <label for="import-collection">Add to Collection</label>
              <select
                id="import-collection"
                bind:value={selectedCollectionId}
                disabled={isImportingFiles}
              >
                <option value="none">None</option>
                {#each collections as collection}
                  <option value={collection.id}>{collection.name}</option>
                {/each}
                <option value="new">+ Create New Collection</option>
              </select>
            </div>

            {#if selectedCollectionId === 'new'}
              <div class="form-group">
                <label for="new-collection-name">New Collection Name</label>
                <input
                  type="text"
                  id="new-collection-name"
                  bind:value={newCollectionName}
                  placeholder="Enter collection name"
                  disabled={isImportingFiles}
                />
              </div>
            {/if}
          </div>
        {/if}

        <div class="import-actions">
          {#if isImportingFiles}
            <div class="progress-info">
              Importing {fileImportProgress.current} of {fileImportProgress.total}...
            </div>
          {:else}
            <button
              onclick={importSelectedFiles}
              class="btn btn-primary"
              disabled={selectedCount === 0 || !user || (selectedCollectionId === 'new' && !newCollectionName.trim())}
            >
              Import {selectedCount} Selected Songs
            </button>
          {/if}
        </div>
      {/if}
    </section>
</main>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-lg) 0;
    border-bottom: 1px solid var(--color-border);
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

  /* Import options */
  .import-options {
    margin-top: var(--spacing-lg);
    padding: var(--spacing-lg);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .import-options h3 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
  }

  .import-options .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .import-options .form-group label {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .import-options .help-text {
    font-size: 0.75rem;
    color: var(--color-text-muted);
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
