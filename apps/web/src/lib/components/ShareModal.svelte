<script lang="ts">
  import { browser } from '$app/environment';
  import { toast } from '$lib/stores/toastStore.svelte';
  import type { Visibility } from '@gigwidget/core';

  interface Props {
    type: 'song' | 'collection';
    id: string;
    title: string;
    visibility: Visibility;
    sourceId?: string; // Original public song ID (for saved/forked songs)
    onClose: () => void;
    onMadePublic?: () => void;
  }

  let { type, id, title, visibility, sourceId, onClose, onMadePublic }: Props = $props();

  let makingPublic = $state(false);
  let currentVisibility = $state(visibility);
  let canNativeShare = $state(false);
  let syncing = $state(false);
  let syncDone = $state(false);

  // For saved/forked songs, share the original source; for originals, share this song's ID
  const shareId = $derived(sourceId ?? id);

  $effect(() => {
    if (browser) {
      canNativeShare = typeof navigator.share === 'function';
      // For original songs (no sourceId), ensure synced to Supabase before sharing
      if (currentVisibility === 'public' && !sourceId && !syncDone) {
        ensureSynced();
      }
    }
  });

  async function ensureSynced() {
    syncing = true;
    try {
      if (type === 'song') {
        const { SongRepository } = await import('@gigwidget/db');
        const { syncSongToCloud } = await import('$lib/stores/syncStore.svelte');
        const song = await SongRepository.getById(id);
        if (song) await syncSongToCloud(song);
      } else {
        const { SongSetRepository } = await import('@gigwidget/db');
        const { syncSongSetToCloud } = await import('$lib/stores/syncStore.svelte');
        const set = await SongSetRepository.getById(id);
        if (set) await syncSongSetToCloud(set);
      }
    } catch (err) {
      console.error('Failed to sync before sharing:', err);
    } finally {
      syncing = false;
      syncDone = true;
    }
  }

  const shareUrl = $derived(
    browser
      ? `${window.location.origin}/shared/${type === 'song' ? 'song' : 'collection'}/${shareId}`
      : ''
  );

  const isPublic = $derived(currentVisibility === 'public');
  const typeLabel = $derived(type === 'song' ? 'song' : 'collection');

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied!');
    } catch {
      toast.error('Failed to copy link');
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: title,
        text: `Check out "${title}" on Gigwidget`,
        url: shareUrl,
      });
    } catch (err: any) {
      // User cancelled — not an error
      if (err?.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }

  async function makePublicAndShare() {
    makingPublic = true;
    try {
      if (type === 'song') {
        const { SongRepository } = await import('@gigwidget/db');
        await SongRepository.update(id, { visibility: 'public' });
        const { syncSongToCloud } = await import('$lib/stores/syncStore.svelte');
        const song = await SongRepository.getById(id);
        if (song) await syncSongToCloud(song);
      } else {
        const { SongSetRepository } = await import('@gigwidget/db');
        await SongSetRepository.update(id, { visibility: 'public' });
        const { syncSongSetToCloud } = await import('$lib/stores/syncStore.svelte');
        const set = await SongSetRepository.getById(id);
        if (set) await syncSongSetToCloud(set);
      }

      currentVisibility = 'public';
      onMadePublic?.();
      toast.success(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} is now public`);
    } catch (err) {
      console.error('Failed to make public:', err);
      toast.error('Failed to make public. Please try again.');
    } finally {
      makingPublic = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={onClose}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <h2>Share {typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}</h2>

    {#if isPublic}
      <p class="share-description">
        Anyone with this link can view "{title}".
      </p>

      <div class="link-row">
        <input
          type="text"
          class="link-input"
          value={shareUrl}
          readonly
          onclick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button class="btn btn-primary btn-copy" onclick={copyLink}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </button>
      </div>

      {#if canNativeShare}
        <button class="btn btn-secondary btn-share-native" onclick={nativeShare}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          Share via...
        </button>
      {/if}

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={onClose}>Done</button>
      </div>
    {:else}
      <p class="share-description">
        This {typeLabel} is currently private. Make it public so others can view it with a link.
      </p>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={onClose} disabled={makingPublic}>Cancel</button>
        {#if onMadePublic}
          <button class="btn btn-primary" onclick={makePublicAndShare} disabled={makingPublic}>
            {makingPublic ? 'Publishing...' : 'Make Public & Share'}
          </button>
        {:else}
          <p class="hint">Only the owner can change visibility.</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    width: 100%;
    max-width: 480px;
  }

  .modal h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }

  .share-description {
    color: var(--color-text-muted);
    font-size: 0.9rem;
    margin: 0 0 1rem;
  }

  .link-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .link-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.85rem;
    min-width: 0;
  }

  .link-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .btn-copy {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    white-space: nowrap;
  }

  .btn-share-native {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .hint {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    font-style: italic;
    margin: 0;
  }
</style>
