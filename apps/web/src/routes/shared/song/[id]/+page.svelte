<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { getPublicSongById, type SupabaseSong } from '$lib/stores/supabaseStore';

  let song = $state<SupabaseSong | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let rendererReady = $state(false);

  // Transpose state (in-memory only, no persistence)
  let transposeSemitones = $state(0);
  let preferFlats = $state(false);
  let transposeContentLocal = (content: string, semitones: number) => content;

  // Renderer controls
  let rendererTheme = $state<'light' | 'dark'>('dark');

  const rendererStyle = $derived(rendererTheme === 'light'
    ? '--component-bg:#ffffff;--component-text:#1a1a1a;--viewer-bg:#ffffff;--viewer-text:#1a1a1a;--chord-color:#0066cc;--header-color:#333333;--chord-charts-bg:#f5f5f5;--chord-charts-border:#dddddd'
    : '--component-bg:var(--color-bg-secondary);--component-text:var(--color-text);--viewer-bg:var(--color-bg-secondary);--viewer-text:var(--color-text);--chord-color:#66b3ff;--header-color:#ffffff;--chord-charts-bg:var(--color-surface);--chord-charts-border:var(--color-border)'
  );

  /** Map legacy display names to v2 short IDs */
  const LEGACY_INSTRUMENT_MAP: Record<string, string> = {
    'Standard Guitar': 'guitar',
    'Drop-D Guitar': 'guitar-drop-d',
    'Standard Ukulele': 'ukulele',
    'Baritone Ukulele': 'baritone-ukulele',
    '5ths tuned Ukulele': 'ukulele-5ths',
    'Standard Mandolin': 'mandolin',
  };

  // Extract instrument from ChordPro content
  function extractInstrumentFromContent(content: string): string {
    const match = content.match(/^\{instrument\s*:\s*([^}]+)\}/im);
    if (match) {
      const raw = match[1].trim();
      return LEGACY_INSTRUMENT_MAP[raw] || raw;
    }
    return 'guitar';
  }

  // Strip metadata directives for clean display
  function stripMetadataDirectives(content: string): string {
    return content
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.match(/^\{(t|title|a|st|artist|key|c|comment|tempo|capo|tuning|duration|composer|copyright|original|album|year|writer)\s*:/i);
      })
      .join('\n');
  }

  const displayContent = $derived.by(() => {
    if (!song?.content) return '';
    let content = song.content;
    if (transposeSemitones !== 0) {
      content = transposeContentLocal(content, transposeSemitones);
    }
    return stripMetadataDirectives(content);
  });

  const effectiveInstrument = $derived(
    song?.content ? extractInstrumentFromContent(song.content) : 'guitar'
  );

  // Back-to-collection context from query params
  const fromCollection = $derived($page.url.searchParams.get('from') === 'collection');
  const collectionId = $derived($page.url.searchParams.get('collectionId'));
  const collectionName = $derived($page.url.searchParams.get('collectionName'));

  $effect(() => {
    if (!browser) return;
    const songId = $page.params.id;
    if (!songId) return;

    loadSong(songId);
    loadTranspose();
    loadRenderer();
  });

  async function loadSong(songId: string) {
    loading = true;
    error = null;

    try {
      const result = await getPublicSongById(songId);
      if (result.data) {
        song = result.data;
      } else {
        error = 'Song not found or is no longer shared.';
      }
    } catch (err) {
      console.error('Failed to load shared song:', err);
      error = 'Failed to load song.';
    } finally {
      loading = false;
    }
  }

  async function loadTranspose() {
    const { transposeChordProContent } = await import('@gigwidget/core');
    transposeContentLocal = (content: string, semitones: number) =>
      transposeChordProContent(content, semitones, preferFlats);
  }

  async function loadRenderer() {
    try {
      await import('@parent-tobias/chordpro-renderer');
      rendererReady = true;
    } catch (err) {
      console.error('Failed to load chordpro-renderer:', err);
    }
  }

  function transposeBy(semitones: number) {
    transposeSemitones += semitones;
    if (transposeSemitones > 11) transposeSemitones -= 12;
    if (transposeSemitones < -11) transposeSemitones += 12;
  }

  function resetTranspose() {
    transposeSemitones = 0;
  }
</script>

<div class="shared-page">
  <header class="shared-header">
    <a href="/" class="logo">Gigwidget</a>
    <a href="/browse" class="browse-link">Browse Songs</a>
  </header>

  {#if loading}
    <div class="center-message">
      <div class="spinner"></div>
      <p>Loading song...</p>
    </div>
  {:else if error}
    <div class="center-message">
      <h2>Not Available</h2>
      <p>{error}</p>
      <a href="/browse" class="btn btn-primary">Browse Songs</a>
    </div>
  {:else if song}
    <div class="song-container">
      <div class="song-meta">
        {#if fromCollection && collectionId}
          <a href="/shared/collection/{collectionId}" class="back-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            {collectionName || 'Back to collection'}
          </a>
        {/if}
        <h1 class="song-title">{song.title}</h1>
        {#if song.artist}
          <p class="song-artist">{song.artist}</p>
        {/if}
        <div class="song-details">
          {#if song.key}
            <span class="detail">Key: {song.key}</span>
          {/if}
          {#if song.tempo}
            <span class="detail">Tempo: {song.tempo}</span>
          {/if}
        </div>
      </div>

      {#if rendererReady && song.content}
        <div class="renderer-toolbar">
          <div class="transpose-buttons">
            <button class="transpose-btn" onclick={() => transposeBy(-1)} title="Transpose down">
              -1
            </button>
            <button class="transpose-display" onclick={resetTranspose} title="Reset transposition">
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
          <div class="toolbar-right">
            <button
              class="toolbar-btn"
              onclick={() => rendererTheme = rendererTheme === 'dark' ? 'light' : 'dark'}
              title={rendererTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {rendererTheme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
        <div class="renderer-wrapper" class:renderer-light={rendererTheme === 'light'} style={rendererStyle}>
          <chordpro-renderer
            content={displayContent}
            chord-position="top"
            instrument={effectiveInstrument}
          ></chordpro-renderer>
        </div>
      {:else if song.content}
        <div class="center-message">Loading viewer...</div>
      {:else}
        <div class="center-message">
          <p>This song has no content.</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .shared-page {
    min-height: 100vh;
    background: var(--color-bg);
    color: var(--color-text);
  }

  .shared-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .logo {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-primary);
    text-decoration: none;
  }

  .browse-link {
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: 0.875rem;
  }

  .browse-link:hover {
    color: var(--color-text);
  }

  .center-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 1.5rem;
    gap: 1rem;
    text-align: center;
  }

  .center-message h2 {
    font-size: 1.5rem;
    margin: 0;
  }

  .center-message p {
    color: var(--color-text-muted);
    margin: 0;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .song-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .song-meta {
    margin-bottom: 1rem;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    text-decoration: none;
    margin-bottom: 0.5rem;
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  .song-title {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0 0 0.25rem;
  }

  .song-artist {
    font-size: 1.1rem;
    color: var(--color-text-muted);
    margin: 0 0 0.5rem;
    font-style: italic;
  }

  .song-details {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .renderer-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }

  .transpose-buttons {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .transpose-btn {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .transpose-btn:hover {
    background: var(--color-bg-hover);
  }

  .transpose-display {
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-primary);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    min-width: 60px;
    text-align: center;
  }

  .transpose-display:hover {
    background: var(--color-bg-hover);
  }

  .reset-btn {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 0.75rem;
    margin-left: 0.25rem;
  }

  .reset-btn:hover {
    color: var(--color-text);
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toolbar-btn {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
    font-size: 0.9rem;
  }

  .toolbar-btn:hover {
    background: var(--color-bg-hover);
  }

  .renderer-wrapper {
    border: 1px solid var(--color-border);
    border-top: none;
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    overflow: hidden;
  }

  .renderer-wrapper.renderer-light {
    background: #fff;
    color: #1a1a1a;
  }


  @media (max-width: 600px) {
    .song-container {
      padding: 1rem;
    }

    .song-title {
      font-size: 1.35rem;
    }
  }
</style>
