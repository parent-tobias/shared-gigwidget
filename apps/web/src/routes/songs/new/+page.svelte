<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { INSTRUMENTS, MUSICAL_KEYS, type Instrument, type MusicalKey } from '@gigwidget/core';

  let title = $state('');
  let artist = $state('');
  let key = $state<MusicalKey | ''>('');
  let tempo = $state<number | ''>('');
  let instrument = $state<Instrument>('guitar');
  let tags = $state('');
  let creating = $state(false);
  let error = $state<string | null>(null);

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

      const arrangement = createArrangement(song.id, instrument, {
        content: `{title: ${song.title}}\n{artist: ${song.artist || 'Unknown'}}\n\n`,
      });

      await SongRepository.create(song);
      await ArrangementRepository.create(arrangement);

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
      <select id="instrument" bind:value={instrument} disabled={creating}>
        {#each INSTRUMENTS as inst}
          <option value={inst}>{inst.charAt(0).toUpperCase() + inst.slice(1)}</option>
        {/each}
      </select>
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
</main>

<style>
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
