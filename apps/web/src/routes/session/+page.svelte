<script lang="ts">
  import { browser } from '$app/environment';
  import type { User, Song, QRSessionPayload } from '@gigwidget/core';
  import { hasPermission } from '@gigwidget/core';
  import { getSessionStore } from '$lib/stores/sessionStore.svelte';

  const session = getSessionStore();

  let user = $state<User | null>(null);
  let songs = $state<Song[]>([]);
  let loading = $state(true);
  let hasLoaded = false;

  // Permission state
  let canHost = $state(false);
  let canJoin = $state(false);

  // Join modal
  let showJoinModal = $state(false);
  let joinError = $state<string | null>(null);
  let scanning = $state(false);
  let manualCode = $state('');

  // Host modal
  let showHostModal = $state(false);
  let selectedSongIds = $state<string[]>([]);
  let shareAll = $state(true);
  let sessionPassword = $state('');
  let creating = $state(false);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadData();
  });

  async function loadData() {
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      const users = await db.users.toArray();
      if (users.length > 0) {
        user = users[0];
        songs = await db.songs.where({ ownerId: user.id }).toArray();
        canHost = hasPermission(user, 'create_sessions');
        canJoin = hasPermission(user, 'join_sessions');
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      loading = false;
    }
  }

  async function startHosting() {
    if (!user) return;

    creating = true;
    try {
      await session.startSession(user, songs, {
        shareAll,
        selectedSongIds: shareAll ? undefined : selectedSongIds,
        password: sessionPassword || undefined,
      });
      showHostModal = false;
    } catch (err) {
      console.error('Failed to start session:', err);
    } finally {
      creating = false;
    }
  }

  async function joinWithQR() {
    scanning = true;
    joinError = null;

    try {
      const { Html5QrcodeScanner } = await import('html5-qrcode');

      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        async (decodedText) => {
          scanner.clear();
          await processQRPayload(decodedText);
        },
        (error) => {
          console.warn('QR scan error:', error);
        }
      );
    } catch (err) {
      console.error('Failed to start QR scanner:', err);
      joinError = 'Failed to access camera';
      scanning = false;
    }
  }

  async function processQRPayload(data: string) {
    scanning = false;
    joinError = null;

    if (!user) {
      joinError = 'User not loaded';
      return;
    }

    try {
      // Try to decode - the data might be base64 encoded or raw JSON
      let payload: QRSessionPayload;
      try {
        // First try base64 decode (compact format)
        const { decodeSessionPayload } = await import('@gigwidget/sync');
        payload = decodeSessionPayload(data);
      } catch {
        // Fallback to raw JSON
        payload = JSON.parse(data);
      }

      await session.joinSession(user, payload);
      showJoinModal = false;
    } catch (err) {
      console.error('Failed to join session:', err);
      joinError = err instanceof Error ? err.message : 'Failed to join session';
    }
  }

  function toggleSongSelection(songId: string) {
    if (selectedSongIds.includes(songId)) {
      selectedSongIds = selectedSongIds.filter((id) => id !== songId);
    } else {
      selectedSongIds = [...selectedSongIds, songId];
    }
  }

  async function copySessionCode() {
    if (!session.qrPayload) return;

    try {
      const { encodeSessionPayload } = await import('@gigwidget/sync');
      const code = encodeSessionPayload(session.qrPayload);
      await navigator.clipboard.writeText(code);
      alert('Session code copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy session code:', err);
    }
  }
</script>

<svelte:head>
  <title>Sharing Session - Gigwidget</title>
</svelte:head>

<main class="container">
  <header class="page-header">
    <div class="header-left">
      <a href="/" class="back-link">← Home</a>
      <h1>Sharing Session</h1>
      <p class="subtitle">Share songs with nearby musicians in real-time</p>
    </div>
  </header>

  {#if loading}
    <div class="loading">Loading...</div>
  {:else if session.isActive}
    <div class="active-session">
      <div class="session-status">
        <span class="status-indicator" class:connected={session.status === 'connected'}></span>
        <span class="status-text">
          {#if session.isHosting}
            Hosting Session
          {:else}
            Connected to {session.qrPayload?.hostName ?? 'Host'}
          {/if}
        </span>
        <span class="peer-count">{session.peerCount} peer{session.peerCount !== 1 ? 's' : ''}</span>
      </div>

      {#if session.isHosting && session.qrDataUrl}
        <div class="qr-section">
          <h3>Scan to Join</h3>
          <img src={session.qrDataUrl} alt="Session QR Code" class="qr-code" />
          <p class="qr-hint">Others can scan this QR code to join your session</p>
          {#if session.qrPayload}
            <button class="btn btn-secondary copy-code-btn" onclick={copySessionCode}>
              Copy Session Code
            </button>
          {/if}
        </div>
      {/if}

      {#if session.qrPayload?.libraryManifest}
        <div class="shared-songs">
          <h3>Shared Songs ({session.qrPayload.libraryManifest.length})</h3>
          <ul class="song-list">
            {#each session.qrPayload.libraryManifest as song (song.id)}
              <li class="song-item">
                <span class="song-title">{song.title}</span>
                {#if song.artist}
                  <span class="song-artist">{song.artist}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if session.participants.length > 0}
        <div class="participants-section">
          <h3>Connected Participants ({session.participants.length + 1})</h3>
          <ul class="participants-list">
            <li class="participant-item host">
              <span class="participant-avatar">🎵</span>
              <span class="participant-name">{session.isHosting ? 'You (Host)' : user?.displayName + ' (Host)'}</span>
            </li>
            {#each session.participants as participant (participant.clientId)}
              {#if !participant.isHost}
                <li class="participant-item">
                  {#if participant.avatarThumbnail}
                    <img src={participant.avatarThumbnail} alt="Avatar" class="participant-avatar" />
                  {:else}
                    <span class="participant-avatar">👤</span>
                  {/if}
                  <div class="participant-info">
                    <span class="participant-name">{participant.displayName}</span>
                    {#if participant.instruments.length > 0}
                      <span class="participant-instruments">
                        {participant.instruments.join(', ')}
                      </span>
                    {/if}
                  </div>
                </li>
              {/if}
            {/each}
          </ul>
        </div>
      {/if}

      <div class="session-actions">
        <p class="session-note">The session overlay will stay visible as you navigate the app.</p>
        <button class="btn btn-danger" onclick={() => session.leaveSession()}>
          {session.isHosting ? 'End Session' : 'Leave Session'}
        </button>
      </div>
    </div>
  {:else}
    <div class="session-options">
      {#if canHost}
        <button class="option-card" onclick={() => (showHostModal = true)}>
          <span class="option-icon">📡</span>
          <span class="option-title">Start Session</span>
          <span class="option-desc">Host a session and share your songs</span>
        </button>
      {:else}
        <div class="option-card disabled">
          <span class="option-icon">📡</span>
          <span class="option-title">Start Session</span>
          <span class="option-desc">Requires Pro subscription</span>
          <a href="/account" class="upgrade-link">Upgrade</a>
        </div>
      {/if}

      <button class="option-card" onclick={() => (showJoinModal = true)}>
        <span class="option-icon">📱</span>
        <span class="option-title">Join Session</span>
        <span class="option-desc">Scan a QR code to join</span>
      </button>
    </div>
  {/if}
</main>

{#if showHostModal}
  <div class="modal-overlay" onclick={() => (showHostModal = false)}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Start Sharing Session</h2>

      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={shareAll} disabled={creating} />
          Share all songs
        </label>
      </div>

      {#if !shareAll}
        <div class="form-group">
          <label>Select songs to share:</label>
          <div class="song-selector">
            {#each songs as song (song.id)}
              <label class="song-checkbox">
                <input
                  type="checkbox"
                  checked={selectedSongIds.includes(song.id)}
                  onchange={() => toggleSongSelection(song.id)}
                  disabled={creating}
                />
                <span>{song.title}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <div class="form-group">
        <label for="password">Password (optional)</label>
        <input
          type="password"
          id="password"
          bind:value={sessionPassword}
          placeholder="Leave empty for open session"
          disabled={creating}
        />
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={() => (showHostModal = false)} disabled={creating}>
          Cancel
        </button>
        <button
          class="btn btn-primary"
          onclick={startHosting}
          disabled={creating || (!shareAll && selectedSongIds.length === 0)}
        >
          {creating ? 'Starting...' : 'Start Session'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showJoinModal}
  <div class="modal-overlay" onclick={() => (showJoinModal = false)}>
    <div class="modal modal-large" onclick={(e) => e.stopPropagation()}>
      <h2>Join Session</h2>

      {#if joinError}
        <div class="error-message">{joinError}</div>
      {/if}

      <div id="qr-reader" class="qr-reader"></div>

      {#if !scanning}
        <button class="btn btn-primary" onclick={joinWithQR}>
          Start Camera
        </button>
      {:else}
        <p class="scan-hint">Point your camera at the host's QR code</p>
      {/if}

      <div class="divider">
        <span>or paste session code</span>
      </div>

      <div class="manual-entry">
        <input
          type="text"
          bind:value={manualCode}
          placeholder="Paste session code here..."
          class="code-input"
        />
        <button
          class="btn btn-secondary"
          onclick={() => processQRPayload(manualCode)}
          disabled={!manualCode.trim()}
        >
          Join
        </button>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={() => (showJoinModal = false)}>
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-header {
    padding: var(--spacing-lg) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .back-link {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  .subtitle {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .session-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--spacing-lg);
    padding: var(--spacing-xl) 0;
  }

  .option-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-xl);
    background-color: var(--color-bg-secondary);
    border: 2px solid transparent;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: center;
  }

  .option-card:hover {
    background-color: var(--color-surface);
    border-color: var(--color-primary);
  }

  .option-icon {
    font-size: 3rem;
    margin-bottom: var(--spacing-md);
  }

  .option-title {
    font-size: 1.25rem;
    font-weight: 500;
    margin-bottom: var(--spacing-xs);
  }

  .option-desc {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .option-card.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .option-card.disabled:hover {
    background-color: var(--color-bg-secondary);
    border-color: transparent;
  }

  .upgrade-link {
    margin-top: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    background-color: var(--color-primary);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    text-decoration: none;
  }

  .active-session {
    padding: var(--spacing-xl) 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-lg);
  }

  .session-status {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--color-text-muted);
  }

  .status-indicator.connected {
    background-color: #4ade80;
  }

  .status-text {
    font-weight: 500;
  }

  .peer-count {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .qr-section {
    text-align: center;
    padding: var(--spacing-lg);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .qr-section h3 {
    margin: 0 0 var(--spacing-md);
  }

  .qr-code {
    max-width: 250px;
    border-radius: var(--radius-md);
    background-color: white;
    padding: var(--spacing-md);
  }

  .qr-hint {
    margin-top: var(--spacing-md);
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .copy-code-btn {
    margin-top: var(--spacing-md);
    font-size: 0.75rem;
  }

  .shared-songs {
    width: 100%;
    max-width: 400px;
  }

  .shared-songs h3 {
    margin-bottom: var(--spacing-md);
  }

  .song-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    max-height: 200px;
    overflow-y: auto;
  }

  .song-item {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-sm);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-sm);
  }

  .song-title {
    font-weight: 500;
  }

  .song-artist {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .session-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
  }

  .session-note {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    text-align: center;
  }

  .btn-danger {
    background-color: var(--color-primary);
    color: white;
  }

  /* Modal */
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

  .modal-large {
    max-width: 500px;
  }

  .modal h2 {
    margin: 0 0 var(--spacing-lg);
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .form-group {
    margin-bottom: var(--spacing-md);
  }

  .form-group label {
    display: block;
    margin-bottom: var(--spacing-xs);
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
  }

  .checkbox-label input {
    width: auto;
  }

  .song-selector {
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .song-checkbox {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs);
    cursor: pointer;
  }

  .song-checkbox input {
    width: auto;
  }

  .qr-reader {
    width: 100%;
    margin-bottom: var(--spacing-md);
  }

  .scan-hint {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    margin: var(--spacing-lg) 0;
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background-color: var(--color-border);
  }

  .manual-entry {
    display: flex;
    gap: var(--spacing-sm);
  }

  .code-input {
    flex: 1;
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
  }

  .participants-section {
    margin-top: var(--spacing-lg);
    padding: var(--spacing-md);
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .participants-section h3 {
    margin: 0 0 var(--spacing-md);
    font-size: 1rem;
  }

  .participants-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .participant-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm);
    background-color: var(--color-bg);
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--color-secondary);
  }

  .participant-item.host {
    border-left-color: var(--color-primary);
  }

  .participant-avatar {
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 50%;
    background-color: var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    overflow: hidden;
    object-fit: cover;
  }

  .participant-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .participant-name {
    font-weight: 500;
    color: var(--color-text);
  }

  .participant-instruments {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
