<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { Song, Arrangement, MusicalKey, Visibility, SongChordOverride } from '@gigwidget/core';
  import { MUSICAL_KEYS, generateId } from '@gigwidget/core';
  import ChordSelectionModal from '$lib/components/ChordSelectionModal.svelte';

  let song = $state<Song | null>(null);
  let arrangements = $state<Arrangement[]>([]);
  let selectedArrangement = $state<Arrangement | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let editMode = $state(false);
  let editorContent = $state('');
  let saving = $state(false);
  let hasLoaded = false;
  let editorReady = $state(false);
  let rendererReady = $state(false);
  let chordListPosition = $state<'top' | 'right' | 'bottom'>('top');
  let theme = $state<'light' | 'dark' | 'auto'>('auto');
  let compactView = $state(false);
  let defaultInstrument = $state<string>('Standard Guitar'); // Default to Standard Guitar to prevent chord viewer errors

  // Renderer view controls
  let isMaximized = $state(false);
  let rendererTheme = $state<'light' | 'dark'>('dark');

  // Transpose state
  let transposeSemitones = $state(0);
  let showTransposeModal = $state(false);
  let preferFlats = $state(false);

  // Song info editing state
  let showInfoModal = $state(false);
  let editTitle = $state('');
  let editArtist = $state('');
  let editKey = $state<MusicalKey | ''>('');
  let editTempo = $state<number | ''>('');
  let editTags = $state('');
  let editVisibility = $state<Visibility>('private');
  let savingInfo = $state(false);

  // Session song tracking
  let isSessionSong = $state(false);
  let sessionStore: ReturnType<typeof import('$lib/stores/sessionStore.svelte').getSessionStore> | null = null;
  let transposeCleanup: (() => void) | null = null;
  let contentUpdateCleanup: (() => void) | null = null;

  // Chord selection state
  let showChordSelectionModal = $state(false);
  let selectedChordForModal = $state<string | null>(null);
  let songChordOverrides = $state<SongChordOverride[]>([]);
  let currentUser = $state<any>(null);
  let showChordPalette = $state(false);

  // Navigation context (for breadcrumbs)
  const fromContext = $derived($page.url.searchParams.get('from'));
  const collectionId = $derived($page.url.searchParams.get('collectionId'));
  const backLink = $derived(
    isSessionSong
      ? '/session'
      : fromContext === 'collection' && collectionId
        ? `/collections/${collectionId}`
        : '/songs'
  );
  const backText = $derived(
    isSessionSong
      ? 'Back to Session'
      : fromContext === 'collection'
        ? 'Back to Collection'
        : 'Back to Songs'
  );

  // Sync state
  let syncStatus = $state<'synced' | 'syncing' | 'offline' | 'error'>('offline');
  let peerCount = $state(0);
  let yjsDoc: any = null;
  let yjsText: any = null;
  let yjsTranspose: any = null; // Y.Map for transpose state (synced in sessions)
  let indexeddbProvider: any = null;

  // Derived: transposed content for view mode (with metadata stripped)
  const displayContent = $derived.by(() => {
    if (!selectedArrangement) return '';
    let content = selectedArrangement.content;
    if (transposeSemitones !== 0) {
      content = transposeContentLocal(content, transposeSemitones);
    }
    // Strip out metadata directives for clean display
    return stripMetadataDirectives(content);
  });

  // Strip metadata directives like {title:...}, {artist:...}, {key:...}, {c:...}, etc.
  function stripMetadataDirectives(content: string): string {
    // Remove metadata directives - matches {directive: value} on any line
    return content
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        // Skip lines that are metadata directives (both full and abbreviated forms)
        // Matches: {t: }, {title: }, {a: }, {artist: }, {key: }, {c: }, {comment: }, {capo: }, etc.
        return !trimmed.match(/^\{(t|title|a|st|artist|key|c|comment|tempo|capo|tuning|duration|composer|copyright|original|album|year|writer)\s*:/i);
      })
      .join('\n');
  }

  // Local transpose function (will be loaded async)
  let transposeContentLocal = (content: string, semitones: number) => content;

  // Get song ID from route
  const songId = $derived($page.params.id);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;

    loadSong();
    loadPreferences();
    loadLitComponents();
    initYjs();
  });

  // Cleanup Yjs and session observation on component destroy
  $effect(() => {
    return () => {
      if (transposeCleanup) {
        transposeCleanup();
        transposeCleanup = null;
      }
      if (contentUpdateCleanup) {
        contentUpdateCleanup();
        contentUpdateCleanup = null;
      }
      if (indexeddbProvider) {
        indexeddbProvider.destroy();
      }
      if (yjsDoc) {
        yjsDoc.destroy();
      }
    };
  });

  async function initYjs() {
    try {
      const Y = await import('yjs');
      const { IndexeddbPersistence } = await import('y-indexeddb');
      const { transposeChordProContent } = await import('@gigwidget/core');

      // Store the transpose function for derived state
      transposeContentLocal = (content: string, semitones: number) =>
        transposeChordProContent(content, semitones, preferFlats);

      yjsDoc = new Y.Doc();
      yjsText = yjsDoc.getText('content');
      yjsTranspose = yjsDoc.getMap('transpose'); // For session-synced transpose state

      // Set up local persistence
      indexeddbProvider = new IndexeddbPersistence(`song-${songId}`, yjsDoc);

      indexeddbProvider.on('synced', () => {
        syncStatus = 'synced';
        // Load content from Yjs if it has data
        const yjsContent = yjsText.toString();
        if (yjsContent && yjsContent.length > 0) {
          editorContent = yjsContent;
        }
        // Load transpose state if set
        const storedTranspose = yjsTranspose.get('semitones');
        if (typeof storedTranspose === 'number') {
          transposeSemitones = storedTranspose;
        }
      });

      // Observe changes to Yjs text
      yjsText.observe(() => {
        const newContent = yjsText.toString();
        if (newContent !== editorContent) {
          editorContent = newContent;
        }
      });

      // Observe changes to transpose state (for session sync)
      yjsTranspose.observe(() => {
        const newTranspose = yjsTranspose.get('semitones');
        if (typeof newTranspose === 'number' && newTranspose !== transposeSemitones) {
          transposeSemitones = newTranspose;
        }
      });
    } catch (err) {
      console.error('Failed to initialize Yjs:', err);
      syncStatus = 'error';
    }
  }

  function updateYjsContent(content: string) {
    if (!yjsDoc || !yjsText) return;

    yjsDoc.transact(() => {
      yjsText.delete(0, yjsText.length);
      yjsText.insert(0, content);
    });
  }

  async function loadLitComponents() {
    try {
      await import('@parent-tobias/chordpro-editor');
      editorReady = true;
    } catch (err) {
      console.error('Failed to load chordpro-editor:', err);
    }

    try {
      await import('@parent-tobias/chordpro-renderer');
      rendererReady = true;
    } catch (err) {
      console.error('Failed to load chordpro-renderer:', err);
    }
  }

  async function loadSong() {
    try {
      const { SongRepository, ArrangementRepository } = await import('@gigwidget/db');

      let foundSong = await SongRepository.getById(songId);

      // If not found locally, check if it's a session song
      if (!foundSong) {
        const { getSessionStore } = await import('$lib/stores/sessionStore.svelte');
        sessionStore = getSessionStore();

        if (sessionStore.isActive && sessionStore.qrPayload?.libraryManifest) {
          const sessionSong = sessionStore.qrPayload.libraryManifest.find(s => s.id === songId);
          if (sessionSong) {
            // Mark this as a session song for navigation purposes
            isSessionSong = true;

            // Create a temporary song object from session manifest
            foundSong = {
              id: sessionSong.id,
              title: sessionSong.title,
              artist: sessionSong.artist,
              key: sessionSong.key,
              tempo: sessionSong.tempo,
              tags: sessionSong.tags || [],
              ownerId: sessionStore.qrPayload.hostId,
              visibility: 'private' as const,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Request content from host via WebRTC
            console.log('[SongViewer] Requesting content from host for:', songId);
            const content = await sessionStore.requestSongContent(songId);

            if (content) {
              console.log('[SongViewer] Received content for:', songId);
              arrangements = [{
                id: `session-${sessionSong.id}`,
                songId: sessionSong.id,
                instrument: 'guitar',
                content,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
              }];
            } else {
              console.log('[SongViewer] No content received for:', songId);
            }

            // Observe host's transpose state (for joiners)
            const initialTranspose = sessionStore.getTranspose(songId);
            if (initialTranspose !== 0) {
              transposeSemitones = initialTranspose;
            }
            transposeCleanup = sessionStore.observeTranspose(songId, (semitones) => {
              console.log('[SongViewer] Transpose update from host:', semitones);
              transposeSemitones = semitones;
            });

            // Observe host's content edits (for joiners)
            contentUpdateCleanup = sessionStore.observeContentUpdates(songId, (updatedContent) => {
              console.log('[SongViewer] Content update from host for:', songId);
              // Update the arrangement content
              if (selectedArrangement) {
                selectedArrangement = {
                  ...selectedArrangement,
                  content: updatedContent,
                  updatedAt: new Date(),
                };
                // If in edit mode, update editor content
                if (editMode) {
                  editorContent = updatedContent;
                }
              }
              // Update arrangements array
              if (arrangements.length > 0) {
                arrangements = [{
                  ...arrangements[0],
                  content: updatedContent,
                  updatedAt: new Date(),
                }];
              }
            });
          }
        }
      }

      if (!foundSong) {
        error = 'Song not found';
        loading = false;
        return;
      }

      song = foundSong;

      // Only load arrangements from DB if we didn't get them from session
      if (arrangements.length === 0) {
        arrangements = await ArrangementRepository.getBySong(songId);
      }

      if (arrangements.length > 0) {
        selectedArrangement = arrangements[0];
        editorContent = selectedArrangement.content;
      }
    } catch (err) {
      console.error('Failed to load song:', err);
      error = err instanceof Error ? err.message : 'Failed to load song';
    } finally {
      loading = false;
    }
  }

  async function loadPreferences() {
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const users = await db.users.toArray();
      if (users.length > 0) {
        const prefs = await db.userPreferences.where('userId').equals(users[0].id).first();
        if (prefs) {
          if (prefs.chordListPosition) chordListPosition = prefs.chordListPosition;
          if (prefs.theme) theme = prefs.theme;
          if (prefs.compactView) compactView = prefs.compactView;
          if (prefs.defaultInstrument) defaultInstrument = prefs.defaultInstrument;

          // Apply compact view class to document
          if (prefs.compactView) {
            document.documentElement.classList.add('compact-view');
          }
        }
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    }
  }

  function toggleMaximize() {
    isMaximized = !isMaximized;
    // Prevent body scroll when maximized
    if (browser) {
      document.body.style.overflow = isMaximized ? 'hidden' : '';
    }
  }

  function toggleRendererTheme() {
    rendererTheme = rendererTheme === 'dark' ? 'light' : 'dark';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isMaximized) {
      toggleMaximize();
    }
  }

  function handleContentChange(e: CustomEvent<{ content: string }>) {
    editorContent = e.detail.content;
    updateYjsContent(e.detail.content);
  }

  async function saveContent() {
    if (!selectedArrangement || !song) return;

    saving = true;
    try {
      const { ArrangementRepository, SongRepository } = await import('@gigwidget/db');

      await ArrangementRepository.update(selectedArrangement.id, {
        content: editorContent,
        version: selectedArrangement.version + 1,
      });

      await SongRepository.update(song.id, {});

      selectedArrangement = {
        ...selectedArrangement,
        content: editorContent,
        version: selectedArrangement.version + 1,
        updatedAt: new Date(),
      };

      // Sync to cloud if authenticated
      const { syncSongToCloud } = await import('$lib/stores/syncStore.svelte');
      await syncSongToCloud(song);

      // Sync to active session if hosting
      if (sessionStore?.isActive && sessionStore?.isHosting && song) {
        console.log('[SongViewer] Syncing edited content to session:', song.id);
        sessionStore.updateSharedContent(song.id, editorContent);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      saving = false;
    }
  }

  function toggleEditMode() {
    if (editMode && editorContent !== selectedArrangement?.content) {
      saveContent();
    }
    editMode = !editMode;
  }

  function selectArrangement(arr: Arrangement) {
    if (editMode && editorContent !== selectedArrangement?.content) {
      saveContent();
    }
    selectedArrangement = arr;
    editorContent = arr.content;
  }

  async function deleteSong() {
    if (!song) return;
    if (!confirm('Are you sure you want to delete this song? This cannot be undone.')) return;

    try {
      const { SongRepository } = await import('@gigwidget/db');
      await SongRepository.delete(song.id);

      // Delete from cloud if authenticated
      const { deleteSongFromCloud } = await import('$lib/stores/syncStore.svelte');
      await deleteSongFromCloud(song.id);

      goto('/songs');
    } catch (err) {
      console.error('Failed to delete song:', err);
      error = 'Failed to delete song';
    }
  }

  // Transpose functions
  async function setTranspose(semitones: number) {
    transposeSemitones = semitones;
    // Sync to Yjs for local persistence
    if (yjsTranspose) {
      yjsTranspose.set('semitones', semitones);
    }
    // Sync to session if hosting (for real-time sync to joiners)
    if (!sessionStore) {
      const { getSessionStore } = await import('$lib/stores/sessionStore.svelte');
      sessionStore = getSessionStore();
    }
    if (sessionStore.isActive && sessionStore.isHosting && song) {
      sessionStore.setTranspose(song.id, semitones);
    }
  }

  function transposeBy(delta: number) {
    // Keep in range -11 to +11
    const newValue = ((transposeSemitones + delta) % 12 + 12) % 12;
    setTranspose(newValue > 6 ? newValue - 12 : newValue);
  }

  async function transposeToKey(targetKey: string) {
    if (!song?.key) return;

    const { getSemitonesBetweenKeys } = await import('@gigwidget/core');
    const semitones = getSemitonesBetweenKeys(song.key, targetKey);
    setTranspose(semitones);
    showTransposeModal = false;
  }

  function resetTranspose() {
    setTranspose(0);
  }

  function getTransposedKey(originalKey: string | undefined, semitones: number): string {
    if (!originalKey || semitones === 0) return originalKey ?? '';
    // This will be computed properly with the transpose function
    return `${originalKey} (transposed)`;
  }

  // Major keys for transpose-to-key dropdown
  const MAJOR_KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  const MINOR_KEYS = ['Am', 'A#m', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m'];

  // Song info editing functions
  function openInfoModal() {
    if (!song) return;
    editTitle = song.title;
    editArtist = song.artist ?? '';
    editKey = song.key ?? '';
    editTempo = song.tempo ?? '';
    editTags = song.tags.join(', ');
    editVisibility = song.visibility;
    showInfoModal = true;
  }

  async function saveInfo() {
    if (!song || !editTitle.trim()) return;

    savingInfo = true;
    try {
      const { SongRepository } = await import('@gigwidget/db');

      const parsedTags = editTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await SongRepository.update(song.id, {
        title: editTitle.trim(),
        artist: editArtist.trim() || undefined,
        key: editKey || undefined,
        tempo: editTempo ? Number(editTempo) : undefined,
        tags: parsedTags,
        visibility: editVisibility,
      });

      // Update local state
      song = {
        ...song,
        title: editTitle.trim(),
        artist: editArtist.trim() || undefined,
        key: editKey || undefined,
        tempo: editTempo ? Number(editTempo) : undefined,
        tags: parsedTags,
        visibility: editVisibility,
        updatedAt: new Date(),
      };

      // Sync to cloud if authenticated
      const { syncSongToCloud } = await import('$lib/stores/syncStore.svelte');
      await syncSongToCloud(song);

      showInfoModal = false;
    } catch (err) {
      console.error('Failed to save song info:', err);
      error = 'Failed to save song info';
    } finally {
      savingInfo = false;
    }
  }

  // Chord selection functions
  async function loadCurrentUser() {
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const users = await db.users.toArray();
      if (users.length > 0) {
        currentUser = users[0];
      }
    } catch (err) {
      console.error('Failed to load current user:', err);
    }
  }

  async function loadSongChordOverrides() {
    if (!currentUser || !song) return;

    try {
      const { SongChordOverrideRepository } = await import('@gigwidget/db');
      songChordOverrides = await SongChordOverrideRepository.getBySong(currentUser.id, song.id);
    } catch (err) {
      console.error('Failed to load song chord overrides:', err);
    }
  }

  function extractChordsFromContent(content: string): string[] {
    // Extract chord names from ChordPro format [ChordName]
    const chordMatches = content.matchAll(/\[([^\]]+)\]/g);
    const chords = new Set<string>();

    for (const match of chordMatches) {
      const chordName = match[1].trim();
      // Filter out non-chord directives (like {title:...})
      if (chordName && !chordName.includes(':')) {
        chords.add(chordName);
      }
    }

    return Array.from(chords).sort();
  }

  const uniqueChords = $derived.by(() => {
    if (!selectedArrangement) return [];
    return extractChordsFromContent(selectedArrangement.content);
  });

  function hasChordOverride(chordName: string): boolean {
    return songChordOverrides.some(o => o.chordName === chordName);
  }

  function handleChordClick(chordName: string) {
    selectedChordForModal = chordName;
    showChordSelectionModal = true;
  }

  async function handleChordSelect(source: string, variationId?: string) {
    if (!currentUser || !song || !selectedChordForModal) return;

    try {
      const { SongChordOverrideRepository } = await import('@gigwidget/db');

      await SongChordOverrideRepository.upsert({
        id: generateId(),
        userId: currentUser.id,
        songId: song.id,
        chordName: selectedChordForModal,
        instrumentId: defaultInstrument || 'guitar',
        selectedSource: source as any,
        selectedVariationId: variationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Reload overrides
      await loadSongChordOverrides();

      showChordSelectionModal = false;
      selectedChordForModal = null;
    } catch (err) {
      console.error('Failed to save chord selection:', err);
    }
  }

  async function handleChordReset() {
    if (!currentUser || !song || !selectedChordForModal) return;

    try {
      const { SongChordOverrideRepository } = await import('@gigwidget/db');

      const override = await SongChordOverrideRepository.getForChord(
        currentUser.id,
        song.id,
        selectedChordForModal
      );

      if (override) {
        await SongChordOverrideRepository.delete(override.id);
        await loadSongChordOverrides();
      }

      showChordSelectionModal = false;
      selectedChordForModal = null;
    } catch (err) {
      console.error('Failed to reset chord selection:', err);
    }
  }

  function getCurrentOverride(chordName: string): SongChordOverride | undefined {
    return songChordOverrides.find(o => o.chordName === chordName);
  }

  // Load user and overrides when song loads
  $effect(() => {
    if (browser && song) {
      loadCurrentUser();
    }
  });

  $effect(() => {
    if (browser && currentUser && song) {
      loadSongChordOverrides();
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>{song?.title ?? 'Loading...'} - Gigwidget</title>
</svelte:head>

<main class="container">
  {#if loading}
    <div class="loading">Loading song...</div>
  {:else if error}
    <div class="error-container">
      <p>{error}</p>
      <a href={backLink} class="btn btn-secondary">
        {backText}
      </a>
    </div>
  {:else if song}
    <header class="page-header">
      <div class="header-left">
        <a href={backLink} class="back-link">
          ← {backText}
        </a>
        <div class="title-row">
          <h1>{song.title}</h1>
          {#if song.visibility === 'public'}
            <span class="visibility-badge public">Public</span>
          {:else}
            <span class="visibility-badge private">Private</span>
          {/if}
        </div>
        {#if song.artist}
          <span class="song-artist">by {song.artist}</span>
        {/if}
      </div>
      <div class="header-actions">
        {#if !isSessionSong}
          <button class="btn btn-secondary btn-sm" onclick={openInfoModal}>ℹ️</button>
          <button class="btn btn-secondary" onclick={toggleEditMode}>
            {editMode ? 'View' : 'Edit'}
          </button>
          <button class="btn btn-danger" onclick={deleteSong}>Delete</button>
        {/if}
      </div>
    </header>

    <div class="song-meta">
    </div>

    {#if !editMode && !isSessionSong && (arrangements.length > 1 || transposeSemitones !== 0)}
      <div class="transpose-controls">
        <div class="transpose-buttons">
          <button class="transpose-btn" onclick={() => transposeBy(-1)} title="Transpose down">
            -1
          </button>
          <button
            class="transpose-display"
            onclick={() => (showTransposeModal = true)}
            title="Click to transpose to key"
          >
            {#if transposeSemitones === 0}
              Original
            {:else}
              {transposeSemitones > 0 ? '+' : ''}{transposeSemitones}
            {/if}
          </button>
          <button class="transpose-btn" onclick={() => transposeBy(1)} title="Transpose up">
            +1
          </button>
        </div>
        {#if transposeSemitones !== 0}
          <button class="reset-btn" onclick={resetTranspose}>Reset</button>
        {/if}
      </div>
    {/if}

    {#if arrangements.length > 1}
      <nav class="arrangement-tabs">
        {#each arrangements as arr}
          <button
            class="arrangement-tab"
            class:active={selectedArrangement?.id === arr.id}
            onclick={() => selectArrangement(arr)}
          >
            {arr.instrument.charAt(0).toUpperCase() + arr.instrument.slice(1)}
            {#if arr.capo}
              (Capo {arr.capo})
            {/if}
          </button>
        {/each}
      </nav>
    {/if}

    <div class="editor-container">
      {#if editMode}
        {#if editorReady}
          <div class="editor-wrapper">
            <chordpro-editor
              content={editorContent}
              theme="chordpro-dark"
              oncontent-changed={handleContentChange}
            ></chordpro-editor>
          </div>
          <div class="editor-actions">
            <span class="save-status">
              {#if saving}
                Saving...
              {:else}
                Auto-saved
              {/if}
            </span>
            <button class="btn btn-primary" onclick={saveContent} disabled={saving}>
              Save Now
            </button>
          </div>
        {:else}
          <div class="loading">Loading editor...</div>
        {/if}
      {:else}
        {#if rendererReady && selectedArrangement}
          <div class="renderer-container" class:maximized={isMaximized}>
            <div class="renderer-toolbar">
              <div class="toolbar-left">
                {#if isSessionSong}
                  <!-- Read-only transpose indicator for session joiners -->
                  {#if transposeSemitones !== 0}
                    <span class="transpose-indicator">
                      Transposed: {transposeSemitones > 0 ? '+' : ''}{transposeSemitones}
                    </span>
                  {/if}
                {:else}
                  <div class="transpose-buttons">
                    <button class="transpose-btn" onclick={() => transposeBy(-1)} title="Transpose down">
                      -1
                    </button>
                    <button
                      class="transpose-display"
                      onclick={() => (showTransposeModal = true)}
                      title="Click to transpose to key"
                    >
                      {#if transposeSemitones === 0}
                        Original
                      {:else}
                        {transposeSemitones > 0 ? '+' : ''}{transposeSemitones}
                      {/if}
                    </button>
                    <button class="transpose-btn" onclick={() => transposeBy(1)} title="Transpose up">
                      +1
                    </button>
                    {#if transposeSemitones !== 0}
                      <button class="reset-btn" onclick={resetTranspose}>Reset</button>
                    {/if}
                  </div>
                {/if}
              </div>
              <div class="toolbar-right">
                {#if uniqueChords.length > 0 && !isSessionSong}
                  <button
                    class="toolbar-btn"
                    onclick={() => (showChordPalette = !showChordPalette)}
                    title={showChordPalette ? 'Hide chord palette' : 'Show chord palette'}
                  >
                    🎸
                  </button>
                {/if}
                <button
                  class="toolbar-btn"
                  onclick={toggleRendererTheme}
                  title={rendererTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {rendererTheme === 'dark' ? '☀️' : '🌙'}
                </button>
                <button
                  class="toolbar-btn maximize-btn"
                  onclick={toggleMaximize}
                  title={isMaximized ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
                >
                  {#if isMaximized}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                    </svg>
                  {:else}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                  {/if}
                </button>
              </div>
            </div>
            <div class="renderer-wrapper" class:renderer-light={rendererTheme === 'light'}>
              <chordpro-renderer
                content={displayContent}
                theme={rendererTheme === 'dark' ? 'chordpro-dark' : 'chordpro-light'}
                chord-position={chordListPosition}
                instrument={defaultInstrument || 'Standard Guitar'}
              ></chordpro-renderer>
            </div>

            {#if showChordPalette && uniqueChords.length > 0 && !isSessionSong}
              <div class="chord-palette">
                <div class="chord-palette-header">
                  <h3>Chords in this song</h3>
                  <button class="close-palette-btn" onclick={() => (showChordPalette = false)}>×</button>
                </div>
                <div class="chord-palette-grid">
                  {#each uniqueChords as chord}
                    <button
                      type="button"
                      class="chord-palette-item"
                      class:has-override={hasChordOverride(chord)}
                      onclick={() => handleChordClick(chord)}
                      title="Click to choose chord variation"
                    >
                      <span class="chord-name">{chord}</span>
                      {#if hasChordOverride(chord)}
                        <span class="override-indicator" title="Custom variation selected">•</span>
                      {/if}
                    </button>
                  {/each}
                </div>
                <p class="chord-palette-hint">
                  Click any chord to choose a specific variation for this song
                </p>
              </div>
            {/if}
          </div>
        {:else if !selectedArrangement}
          <div class="empty-state">
            <p>No arrangement found for this song.</p>
          </div>
        {:else}
          <div class="loading">Loading viewer...</div>
        {/if}
      {/if}
    </div>
  {/if}
</main>

{#if showTransposeModal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Transpose options" tabindex="-1" onclick={() => (showTransposeModal = false)} onkeydown={(e) => e.key === 'Escape' && (showTransposeModal = false)}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal" role="document" onclick={(e) => e.stopPropagation()}>
      <h2>Transpose</h2>

      <div class="transpose-options">
        <div class="transpose-section">
          <h4>By Semitones</h4>
          <div class="semitone-grid">
            {#each [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as semitone}
              <button
                class="semitone-btn"
                class:active={transposeSemitones === semitone}
                onclick={() => { setTranspose(semitone); showTransposeModal = false; }}
              >
                {semitone === 0 ? '0' : semitone > 0 ? `+${semitone}` : semitone}
              </button>
            {/each}
          </div>
        </div>

        {#if song?.key}
          <div class="transpose-section">
            <h4>To Key (from {song.key})</h4>
            <div class="key-grid">
              {#each (song.key.includes('m') ? MINOR_KEYS : MAJOR_KEYS) as targetKey}
                <button
                  class="key-btn"
                  class:active={targetKey === song.key && transposeSemitones === 0}
                  onclick={() => transposeToKey(targetKey)}
                >
                  {targetKey}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <div class="transpose-section">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={preferFlats} />
            Prefer flats (Bb instead of A#)
          </label>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={() => (showTransposeModal = false)}>
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showInfoModal}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Song information" tabindex="-1" onclick={() => (showInfoModal = false)} onkeydown={(e) => e.key === 'Escape' && (showInfoModal = false)}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal" role="document" onclick={(e) => e.stopPropagation()}>
      <h2>Song Info</h2>

      <form class="info-form" onsubmit={(e) => { e.preventDefault(); saveInfo(); }}>
        <div class="form-section">
          <h3>Basic Info</h3>
          <div class="form-group">
            <label for="edit-title">Title *</label>
            <input
              type="text"
              id="edit-title"
              bind:value={editTitle}
              placeholder="Enter song title"
              required
              disabled={savingInfo}
            />
          </div>

          <div class="form-group">
            <label for="edit-artist">Artist</label>
            <input
              type="text"
              id="edit-artist"
              bind:value={editArtist}
              placeholder="Enter artist name"
              disabled={savingInfo}
            />
          </div>
        </div>

        <div class="form-section">
          <h3>Details</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="edit-key">Key</label>
              <select id="edit-key" bind:value={editKey} disabled={savingInfo}>
                <option value="">Select key</option>
                {#each MUSICAL_KEYS as k}
                  <option value={k}>{k}</option>
                {/each}
              </select>
            </div>

            <div class="form-group">
              <label for="edit-tempo">Tempo (BPM)</label>
              <input
                type="number"
                id="edit-tempo"
                bind:value={editTempo}
                placeholder="120"
                min="20"
                max="300"
                disabled={savingInfo}
              />
            </div>
          </div>

          <div class="form-group">
            <label for="edit-tags">Tags</label>
            <input
              type="text"
              id="edit-tags"
              bind:value={editTags}
              placeholder="rock, classic, favorite (comma-separated)"
              disabled={savingInfo}
            />
          </div>
        </div>

        <div class="form-section">
          <h3>Visibility</h3>
          <div class="visibility-options">
            <label class="visibility-option" class:selected={editVisibility === 'private'}>
              <input
                type="radio"
                name="visibility"
                value="private"
                bind:group={editVisibility}
                disabled={savingInfo}
              />
              <div class="visibility-content">
                <span class="visibility-label">Private</span>
                <span class="visibility-desc">Only you can see this song</span>
              </div>
            </label>
            <label class="visibility-option" class:selected={editVisibility === 'public'}>
              <input
                type="radio"
                name="visibility"
                value="public"
                bind:group={editVisibility}
                disabled={savingInfo}
              />
              <div class="visibility-content">
                <span class="visibility-label">Public</span>
                <span class="visibility-desc">Anyone can discover and view this song</span>
              </div>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick={() => (showInfoModal = false)} disabled={savingInfo}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={savingInfo || !editTitle.trim()}>
            {savingInfo ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showChordSelectionModal && selectedChordForModal && song}
  <ChordSelectionModal
    songId={song.id}
    chordName={selectedChordForModal}
    instrumentId={defaultInstrument || 'guitar'}
    currentOverride={getCurrentOverride(selectedChordForModal)}
    onSelect={handleChordSelect}
    onReset={handleChordReset}
    onClose={() => {
      showChordSelectionModal = false;
      selectedChordForModal = null;
    }}
  />
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

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .title-row h1 {
    margin: 0;
  }

  .visibility-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .visibility-badge.public {
    background-color: rgba(74, 222, 128, 0.2);
    color: #4ade80;
    border: 1px solid #4ade80;
  }

  .visibility-badge.private {
    background-color: rgba(148, 163, 184, 0.2);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
  }

  .back-link {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  .song-artist {
    color: var(--color-text-muted);
    font-size: 1rem;
  }

  .header-actions {
    display: flex;
    gap: var(--spacing-sm);
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

  .song-meta {
    display: none;
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-xs);
    font-size: 0.875rem;
    min-width: auto;
  }

  .arrangement-tabs {
    display: flex;
    gap: var(--spacing-xs);
    padding: var(--spacing-md) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .arrangement-tab {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-secondary);
    color: var(--color-text-muted);
    transition: all var(--transition-fast);
  }

  .arrangement-tab:hover {
    background-color: var(--color-surface);
    color: var(--color-text);
  }

  .arrangement-tab.active {
    background-color: var(--color-primary);
    color: white;
  }

  .editor-container {
    padding: var(--spacing-lg) 0;
    min-height: 400px;
  }

  .editor-wrapper,
  .renderer-wrapper {
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
    min-height: 300px;
  }

  /* Renderer container for maximize support */
  .renderer-container {
    display: flex;
    flex-direction: column;
  }

  .renderer-container.maximized {
    position: fixed;
    inset: 0;
    z-index: 200;
    background-color: var(--color-bg);
    display: flex;
    flex-direction: column;
  }

  .renderer-container.maximized .renderer-toolbar {
    border-radius: 0;
    flex-shrink: 0;
  }

  .renderer-container.maximized .renderer-wrapper {
    flex: 1;
    border-radius: 0;
    overflow-y: auto;
    min-height: 0;
  }

  .renderer-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    margin-bottom: -1px;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .toolbar-btn {
    padding: var(--spacing-xs) var(--spacing-sm);
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    transition: all var(--transition-fast);
  }

  .toolbar-btn:hover {
    background-color: var(--color-surface);
    border-color: var(--color-primary);
  }

  .toolbar-btn svg {
    display: block;
  }

  .maximize-btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .renderer-toolbar .transpose-buttons {
    margin: 0;
  }

  /* Light theme for renderer */
  .renderer-wrapper.renderer-light {
    background-color: #ffffff;
    color: #1a1a1a;
  }

  .renderer-wrapper.renderer-light chordpro-renderer {
    --component-bg: #ffffff;
    --component-text: #1a1a1a;
    --viewer-bg: #ffffff;
    --viewer-text: #1a1a1a;
    --chord-color: #0066cc;
    --header-color: #333333;
    --chord-charts-bg: #f5f5f5;
    --chord-charts-border: #dddddd;
  }

  /* Dark theme for renderer (explicit for consistency) */
  .renderer-wrapper:not(.renderer-light) chordpro-renderer {
    --component-bg: var(--color-bg-secondary);
    --component-text: var(--color-text);
    --viewer-bg: var(--color-bg-secondary);
    --viewer-text: var(--color-text);
    --chord-color: #66b3ff;
    --header-color: #ffffff;
    --chord-charts-bg: var(--color-surface);
    --chord-charts-border: var(--color-border);
  }

  .editor-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md) 0;
  }

  .save-status {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .error-container {
    text-align: center;
    padding: var(--spacing-xl);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  chordpro-editor,
  chordpro-renderer {
    display: block;
    width: 100%;
    min-height: 300px;
    line-height: 1.4;
  }

  /* Transpose controls */
  .transpose-controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) 0;
  }

  .transpose-indicator {
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .transpose-buttons {
    display: flex;
    align-items: center;
    gap: 0;
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .transpose-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    color: var(--color-text);
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .transpose-btn:hover {
    background-color: var(--color-surface);
  }

  .transpose-display {
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface);
    border: none;
    color: var(--color-primary);
    font-weight: 600;
    min-width: 80px;
    cursor: pointer;
  }

  .transpose-display:hover {
    background-color: var(--color-primary);
    color: white;
  }

  .reset-btn {
    padding: var(--spacing-xs) var(--spacing-sm);
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    margin-left: auto;
  }

  .reset-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  /* Transpose modal */
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
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal h2 {
    margin: 0 0 var(--spacing-lg);
  }

  .transpose-options {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .transpose-section h4 {
    margin: 0 0 var(--spacing-sm);
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .semitone-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--spacing-xs);
  }

  .semitone-btn {
    padding: var(--spacing-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .semitone-btn:hover {
    background-color: var(--color-surface);
  }

  .semitone-btn.active {
    background-color: var(--color-primary);
    color: white;
  }

  .key-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--spacing-xs);
  }

  .key-btn {
    padding: var(--spacing-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .key-btn:hover {
    background-color: var(--color-surface);
  }

  .key-btn.active {
    background-color: var(--color-secondary);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .checkbox-label input {
    width: auto;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
  }

  /* Song info form styles */
  .info-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .form-section h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .form-group label {
    font-weight: 500;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
  }

  .info-form input,
  .info-form select {
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 1rem;
  }

  .info-form input:focus,
  .info-form select:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .info-form input:disabled,
  .info-form select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .info-form select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23a0a0a0' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--spacing-md) center;
    padding-right: 2.5rem;
  }

  /* Visibility options */
  .visibility-options {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .visibility-option {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .visibility-option:hover {
    border-color: var(--color-text-muted);
  }

  .visibility-option.selected {
    border-color: var(--color-primary);
    background-color: rgba(233, 69, 96, 0.1);
  }

  .visibility-option input[type="radio"] {
    width: auto;
    margin-top: 2px;
  }

  .visibility-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .visibility-label {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .visibility-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  /* Chord palette styles */
  .chord-palette {
    background-color: var(--color-surface);
    border-top: 1px solid var(--color-border);
    padding: var(--spacing-md);
    max-height: 300px;
    overflow-y: auto;
  }

  .renderer-container.maximized .chord-palette {
    max-height: 200px;
  }

  .chord-palette-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-sm);
  }

  .chord-palette-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .close-palette-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .close-palette-btn:hover {
    color: var(--color-text);
  }

  .chord-palette-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-sm);
  }

  .chord-palette-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .chord-palette-item:hover {
    background-color: var(--color-bg);
    border-color: var(--color-primary);
    transform: translateY(-1px);
  }

  .chord-palette-item.has-override {
    border-color: var(--color-primary);
    background-color: rgba(233, 69, 96, 0.1);
  }

  .chord-palette-item .chord-name {
    font-family: monospace;
  }

  .chord-palette-item .override-indicator {
    color: var(--color-primary);
    font-size: 1.5rem;
    line-height: 1;
  }

  .chord-palette-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-style: italic;
  }

  @media (max-width: 1024px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-md);
    }

    .header-actions {
      width: 100%;
      flex-wrap: wrap;
    }

    .arrangement-tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .modal {
      max-width: 90vw;
      max-height: 80vh;
    }

    .semitone-grid,
    .key-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  @media (max-width: 768px) {
    .container {
      padding: var(--spacing-md);
    }

    .page-header {
      flex-direction: column;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) 0;
    }

    .header-left {
      gap: var(--spacing-xs);
      width: 100%;
    }

    .header-left h1 {
      font-size: 1.5rem;
      margin: 0;
    }

    .song-artist {
      font-size: 0.875rem;
    }

    .header-actions {
      width: 100%;
      gap: var(--spacing-sm);
    }

    .header-actions .btn {
      flex: 1;
      padding: var(--spacing-sm) var(--spacing-md);
      font-size: 0.875rem;
    }

    .btn-sm {
      flex: 0 1 auto;
      min-width: 40px;
      padding: var(--spacing-sm);
    }

    .arrangement-tabs {
      gap: 0;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin: 0 -var(--spacing-md);
      padding: 0 var(--spacing-md);
    }

    .arrangement-tab {
      flex-shrink: 0;
      padding: var(--spacing-sm);
      font-size: 0.875rem;
    }

    .renderer-toolbar {
      padding: var(--spacing-sm) var(--spacing-sm) 0;
      flex-wrap: wrap;
    }

    .transpose-buttons {
      width: 100%;
    }

    .transpose-btn {
      padding: var(--spacing-sm);
      font-size: 0.875rem;
    }

    .transpose-display {
      min-width: 60px;
      padding: var(--spacing-sm);
      font-size: 0.875rem;
    }

    .reset-btn {
      width: 100%;
      margin-left: 0;
      margin-top: var(--spacing-sm);
      padding: var(--spacing-sm);
    }

    .editor-wrapper,
    .renderer-wrapper {
      padding: var(--spacing-sm);
      min-height: 200px;
    }

    chordpro-editor,
    chordpro-renderer {
      min-height: 200px;
    }

    .modal {
      max-width: 95vw;
      max-height: 90vh;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
    }

    .modal h2 {
      font-size: 1.25rem;
      margin: 0 0 var(--spacing-md);
    }

    .transpose-options {
      gap: var(--spacing-md);
    }

    .semitone-grid,
    .key-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: var(--spacing-xs);
    }

    .semitone-btn,
    .key-btn {
      padding: var(--spacing-xs);
      font-size: 0.75rem;
    }

    .modal-actions {
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .modal-actions .btn {
      width: 100%;
    }

    .info-form {
      gap: var(--spacing-md);
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .form-section {
      gap: var(--spacing-sm);
    }

    .form-section h3 {
      font-size: 0.75rem;
    }

    .form-group label {
      font-size: 0.7rem;
    }

    .info-form input,
    .info-form select {
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: 1rem;
    }

    .editor-actions {
      flex-direction: column-reverse;
      gap: var(--spacing-sm);
    }

    .save-status {
      text-align: center;
      font-size: 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .container {
      padding: var(--spacing-sm);
    }

    .page-header {
      gap: 0;
      padding: var(--spacing-sm) 0;
    }

    .header-left h1 {
      font-size: 1.25rem;
    }

    .header-left {
      gap: 0;
    }

    .back-link {
      font-size: 0.75rem;
    }

    .song-artist {
      font-size: 0.75rem;
    }

    .header-actions {
      width: 100%;
      gap: 0;
    }

    .header-actions .btn {
      flex: 1;
      padding: var(--spacing-xs);
      font-size: 0.75rem;
      border-radius: 0;
    }

    .header-actions .btn:not(:last-child) {
      border-right: 1px solid var(--color-border);
    }

    .btn-sm {
      padding: var(--spacing-xs) var(--spacing-xs);
      font-size: 0.875rem;
    }

    .arrangement-tabs {
      margin: var(--spacing-sm) -var(--spacing-sm) 0;
      padding: 0 var(--spacing-sm);
      gap: 0;
    }

    .arrangement-tab {
      padding: var(--spacing-xs);
      font-size: 0.75rem;
      flex: 1;
      text-align: center;
      border-radius: 0;
    }

    .editor-container {
      padding: 0;
      min-height: 300px;
    }

    .renderer-toolbar {
      padding: var(--spacing-xs);
      border-radius: 0;
      gap: var(--spacing-xs);
      flex-wrap: wrap;
    }

    .toolbar-left {
      flex: 1;
      min-width: 0;
    }

    .toolbar-right {
      gap: var(--spacing-xs);
    }

    .toolbar-btn {
      padding: var(--spacing-xs);
      font-size: 0.875rem;
    }

    .transpose-buttons {
      width: 100%;
      border-radius: 0;
      gap: 0;
    }

    /* Maximized view takes full screen */
    .renderer-container.maximized .renderer-toolbar {
      padding: var(--spacing-xs);
    }

    .renderer-container.maximized .renderer-wrapper {
      padding: var(--spacing-sm);
    }

    .transpose-btn {
      flex: 1;
      padding: var(--spacing-xs);
      font-size: 0.75rem;
    }

    .transpose-display {
      flex: 1;
      min-width: auto;
      padding: var(--spacing-xs);
      font-size: 0.75rem;
    }

    .reset-btn {
      width: 100%;
      margin: 0;
      padding: var(--spacing-xs);
      font-size: 0.7rem;
    }

    .editor-wrapper,
    .renderer-wrapper {
      padding: var(--spacing-xs);
      min-height: 150px;
      border-radius: 0;
    }

    chordpro-editor,
    chordpro-renderer {
      min-height: 150px;
      font-size: 0.875rem;
    }

    .modal-overlay {
      padding: 0;
    }

    .modal {
      max-width: 100vw;
      max-height: 100vh;
      padding: var(--spacing-sm);
      border-radius: 0;
      width: 100%;
    }

    .modal h2 {
      font-size: 1.125rem;
      margin: 0 0 var(--spacing-sm);
    }

    .transpose-options {
      gap: var(--spacing-sm);
    }

    .transpose-section h4 {
      font-size: 0.75rem;
      margin: 0 0 var(--spacing-xs);
    }

    .semitone-grid,
    .key-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
    }

    .semitone-btn,
    .key-btn {
      padding: 4px;
      font-size: 0.7rem;
    }

    .modal-actions {
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .modal-actions .btn {
      width: 100%;
      padding: var(--spacing-sm);
      font-size: 0.875rem;
    }

    .info-form {
      gap: var(--spacing-sm);
    }

    .form-section {
      gap: var(--spacing-xs);
    }

    .form-section h3 {
      font-size: 0.7rem;
    }

    .form-group label {
      font-size: 0.65rem;
    }

    .info-form input,
    .info-form select {
      padding: 6px 8px;
      font-size: 16px;
      border-radius: var(--radius-sm);
    }

    .info-form select {
      background-position: right 8px center;
      padding-right: 28px;
    }

    .checkbox-label {
      font-size: 0.75rem;
      gap: var(--spacing-xs);
    }

    .editor-actions {
      flex-direction: column-reverse;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs) 0;
    }

    .save-status {
      font-size: 0.7rem;
      text-align: center;
    }

    .editor-actions .btn {
      width: 100%;
      padding: var(--spacing-sm);
    }
  }
</style>
