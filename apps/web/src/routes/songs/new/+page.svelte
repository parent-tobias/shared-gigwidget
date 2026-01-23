<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { INSTRUMENTS, MUSICAL_KEYS, type Instrument, type MusicalKey, type User, type CustomInstrument, hasPermission } from '@gigwidget/core';

  let title = $state('');
  let artist = $state('');
  let key = $state<MusicalKey | ''>('');
  let tempo = $state<number | ''>('');
  let selectedInstrument = $state<string>('guitar'); // Can be Instrument or custom:id
  let tags = $state('');
  let creating = $state(false);
  let error = $state<string | null>(null);
  let user = $state<User | null>(null);
  let canCreate = $state(false);
  let customInstruments = $state<CustomInstrument[]>([]);
  let hasLoaded = false;

  // Parse the selected instrument value
  function getInstrumentInfo(): { instrument: Instrument; customInstrumentId?: string; tuning?: string } {
    if (selectedInstrument.startsWith('custom:')) {
      const customId = selectedInstrument.replace('custom:', '');
      const custom = customInstruments.find(c => c.id === customId);
      if (custom) {
        return {
          instrument: custom.baseType,
          customInstrumentId: custom.id,
          tuning: custom.strings.join(','),
        };
      }
    }
    return { instrument: selectedInstrument as Instrument };
  }

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadData();
  });

  async function loadData() {
    const { getDatabase, CustomInstrumentRepository } = await import('@gigwidget/db');
    const db = getDatabase();
    const users = await db.users.toArray();
    if (users.length > 0) {
      user = users[0];
      canCreate = hasPermission(user, 'create_songs');
      customInstruments = await CustomInstrumentRepository.getByUser(user.id);
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    if (!title.trim()) {
      error = 'Title is required';
      return;
    }

    creating = true;
    error = null;

    try {
      const { createSong, createArrangement } = await import('@gigwidget/core');
      const { SongRepository, ArrangementRepository, getDatabase } = await import('@gigwidget/db');

      const db = getDatabase();
      const users = await db.users.toArray();
      if (users.length === 0) {
        throw new Error('No user found');
      }

      const userId = users[0].id;
      const parsedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const song = createSong(userId, title.trim(), {
        artist: artist.trim() || undefined,
        key: key || undefined,
        tempo: tempo ? Number(tempo) : undefined,
        tags: parsedTags,
        visibility: 'private',
      });

      const instrumentInfo = getInstrumentInfo();
      const arrangement = createArrangement(song.id, instrumentInfo.instrument, {
        content: `{title: ${song.title}}\n{artist: ${song.artist || 'Unknown'}}\n\n`,
        tuning: instrumentInfo.tuning,
      });

      await SongRepository.create(song);
      await ArrangementRepository.create(arrangement);

      // Sync to cloud if authenticated
      const { syncSongToCloud } = await import('$lib/stores/syncStore.svelte');
      await syncSongToCloud(song);

      goto(`/songs/${song.id}`);
    } catch (err) {
      console.error('Failed to create song:', err);
      error = err instanceof Error ? err.message : 'Failed to create song';
      creating = false;
    }
  }
</script>

<svelte:head>
  <title>New Song - Gigwidget</title>
</svelte:head>

<main class="container">
  <header class="page-header">
    <div class="header-left">
      <a href="/songs" class="back-link">← Back to Songs</a>
      <h1>New Song</h1>
    </div>
  </header>

  {#if !canCreate && user}
    <div class="upgrade-notice">
      <h2>Upgrade Required</h2>
      <p>Creating songs requires a Basic subscription or higher.</p>
      <a href="/account" class="btn btn-primary">View Plans</a>
    </div>
  {:else}
  <form class="song-form" onsubmit={handleSubmit}>
    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    <div class="form-group">
      <label for="title">Title *</label>
      <input
        type="text"
        id="title"
        bind:value={title}
        placeholder="Enter song title"
        required
        disabled={creating}
      />
    </div>

    <div class="form-group">
      <label for="artist">Artist</label>
      <input
        type="text"
        id="artist"
        bind:value={artist}
        placeholder="Enter artist name"
        disabled={creating}
      />
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="key">Key</label>
        <select id="key" bind:value={key} disabled={creating}>
          <option value="">Select key</option>
          {#each MUSICAL_KEYS as k}
            <option value={k}>{k}</option>
          {/each}
        </select>
      </div>

      <div class="form-group">
        <label for="tempo">Tempo (BPM)</label>
        <input
          type="number"
          id="tempo"
          bind:value={tempo}
          placeholder="120"
          min="20"
          max="300"
          disabled={creating}
        />
      </div>
    </div>

    <div class="form-group">
      <label for="instrument">Primary Instrument</label>
      <select id="instrument" bind:value={selectedInstrument} disabled={creating}>
        <optgroup label="Standard Instruments">
          {#each INSTRUMENTS as inst}
            <option value={inst}>{inst.charAt(0).toUpperCase() + inst.slice(1)}</option>
          {/each}
        </optgroup>
        {#if customInstruments.length > 0}
          <optgroup label="My Custom Instruments">
            {#each customInstruments as custom}
              <option value="custom:{custom.id}">{custom.name} ({custom.baseType})</option>
            {/each}
          </optgroup>
        {/if}
      </select>
      {#if customInstruments.length === 0}
        <span class="help-text">
          <a href="/instruments">Create custom instruments</a> with custom tunings
        </span>
      {/if}
    </div>

    <div class="form-group">
      <label for="tags">Tags</label>
      <input
        type="text"
        id="tags"
        bind:value={tags}
        placeholder="rock, classic, favorite (comma-separated)"
        disabled={creating}
      />
    </div>

    <div class="form-actions">
      <a href="/songs" class="btn btn-secondary">Cancel</a>
      <button type="submit" class="btn btn-primary" disabled={creating}>
        {#if creating}
          Creating...
        {:else}
          Create Song
        {/if}
      </button>
    </div>
  </form>
  {/if}
</main>

<style>
  .upgrade-notice {
    text-align: center;
    padding: var(--spacing-xl);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    margin-top: var(--spacing-xl);
  }

  .upgrade-notice h2 {
    margin-bottom: var(--spacing-sm);
  }

  .upgrade-notice p {
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-lg);
  }

  .page-header {
    padding: var(--spacing-lg) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .back-link {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  .song-form {
    max-width: 600px;
    margin: var(--spacing-xl) auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .form-group label {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .help-text a {
    color: var(--color-primary);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
  }

  select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23a0a0a0' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--spacing-md) center;
    padding-right: 2.5rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-md);
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--color-border);
  }

  button:disabled,
  input:disabled,
  select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 500px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }
</style>
