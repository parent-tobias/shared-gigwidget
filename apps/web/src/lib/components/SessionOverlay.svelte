<script lang="ts">
  import { getSessionStore } from '$lib/stores/sessionStore.svelte';

  const session = getSessionStore();
</script>

{#if session.isActive}
  <div class="session-overlay" class:minimized={session.isMinimized}>
    {#if session.isMinimized}
      <!-- Minimized state: small floating pill -->
      <button class="minimized-pill" onclick={() => session.expand()}>
        <span class="status-dot" class:connected={session.status === 'connected'}></span>
        <span class="pill-text">
          {session.isHosting ? 'Hosting' : 'Session'}
        </span>
        {#if session.participants.length > 0}
          <div class="participant-avatars">
            {#each session.participants.slice(0, 3) as p (p.clientId)}
              <div class="mini-avatar">
                {#if p.avatarThumbnail}
                  <img src={p.avatarThumbnail} alt="" />
                {:else}
                  <span>{p.displayName.charAt(0)}</span>
                {/if}
              </div>
            {/each}
            {#if session.participants.length > 3}
              <div class="mini-avatar more">+{session.participants.length - 3}</div>
            {/if}
          </div>
        {:else}
          <span class="peer-badge">{session.peerCount}</span>
        {/if}
      </button>
    {:else}
      <!-- Expanded state: full panel -->
      <div class="session-panel">
        <div class="panel-header">
          <div class="header-info">
            <span class="status-dot" class:connected={session.status === 'connected'}></span>
            <span class="status-text">
              {#if session.isHosting}
                Hosting Session
              {:else}
                Connected
              {/if}
            </span>
            <span class="peer-count">{session.peerCount} peer{session.peerCount !== 1 ? 's' : ''}</span>
          </div>
          <button class="minimize-btn" onclick={() => session.minimize()} aria-label="Minimize">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 15l-6-6-6 6"/>
            </svg>
          </button>
        </div>

        {#if session.isHosting && session.qrDataUrl}
          <div class="qr-section">
            <img src={session.qrDataUrl} alt="Session QR Code" class="qr-code" />
            <p class="qr-hint">Scan to join</p>
          </div>
        {/if}

        {#if session.participants.length > 0}
          <div class="participants-section">
            <span class="section-label">Participants</span>
            <div class="participants-list">
              {#each session.participants as participant (participant.clientId)}
                <div class="participant" class:is-host={participant.isHost}>
                  <div class="participant-avatar">
                    {#if participant.avatarThumbnail}
                      <img src={participant.avatarThumbnail} alt="" />
                    {:else}
                      <span class="avatar-initial">{participant.displayName.charAt(0)}</span>
                    {/if}
                  </div>
                  <div class="participant-info">
                    <span class="participant-name">
                      {participant.displayName}
                      {#if participant.isHost}
                        <span class="host-badge">Host</span>
                      {/if}
                    </span>
                    {#if participant.instruments.length > 0}
                      <span class="participant-instruments">
                        {participant.instruments.slice(0, 2).join(', ')}
                        {#if participant.instruments.length > 2}+{participant.instruments.length - 2}{/if}
                      </span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if session.qrPayload?.libraryManifest && session.qrPayload.libraryManifest.length > 0}
          <div class="shared-songs">
            <span class="songs-label">Sharing {session.qrPayload.libraryManifest.length} song{session.qrPayload.libraryManifest.length !== 1 ? 's' : ''}</span>
          </div>
        {/if}

        {#if session.error}
          <div class="error-message">{session.error}</div>
        {/if}

        <button class="end-btn" onclick={() => session.leaveSession()}>
          {session.isHosting ? 'End Session' : 'Leave'}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .session-overlay {
    position: fixed;
    bottom: var(--spacing-lg);
    right: var(--spacing-lg);
    z-index: 1000;
    transition: all var(--transition-normal);
  }

  /* Minimized pill */
  .minimized-pill {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 9999px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all var(--transition-fast);
  }

  .minimized-pill:hover {
    background-color: var(--color-bg-secondary);
    transform: scale(1.02);
  }

  .pill-text {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .peer-badge {
    background-color: var(--color-primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 9999px;
    min-width: 20px;
    text-align: center;
  }

  .participant-avatars {
    display: flex;
    margin-left: var(--spacing-xs);
  }

  .mini-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: var(--color-bg-secondary);
    margin-left: -6px;
    border: 2px solid var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    overflow: hidden;
  }

  .mini-avatar:first-child {
    margin-left: 0;
  }

  .mini-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mini-avatar.more {
    background-color: var(--color-primary);
    color: white;
    font-weight: 600;
  }

  /* Expanded panel */
  .session-panel {
    width: 280px;
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .status-dot.connected {
    background-color: #4ade80;
    box-shadow: 0 0 8px #4ade80;
  }

  .status-text {
    font-size: 0.875rem;
    font-weight: 500;
  }

  .peer-count {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .minimize-btn {
    padding: var(--spacing-xs);
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .minimize-btn:hover {
    background-color: var(--color-bg-secondary);
    color: var(--color-text);
  }

  /* QR Section */
  .qr-section {
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: var(--color-bg-secondary);
  }

  .qr-code {
    width: 160px;
    height: 160px;
    border-radius: var(--radius-md);
    background-color: white;
    padding: var(--spacing-xs);
  }

  .qr-hint {
    margin-top: var(--spacing-xs);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  /* Participants section */
  .participants-section {
    padding: var(--spacing-sm) var(--spacing-md);
    border-top: 1px solid var(--color-border);
  }

  .section-label {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .participants-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
    max-height: 150px;
    overflow-y: auto;
  }

  .participant {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
  }

  .participant.is-host {
    background-color: var(--color-surface);
  }

  .participant-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    overflow: hidden;
    background-color: var(--color-bg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .participant-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-initial {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .participant-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .participant-name {
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .host-badge {
    background-color: var(--color-primary);
    color: white;
    font-size: 0.6rem;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 600;
  }

  .participant-instruments {
    font-size: 0.7rem;
    color: var(--color-text-muted);
  }

  /* Shared songs */
  .shared-songs {
    padding: var(--spacing-sm) var(--spacing-md);
    border-top: 1px solid var(--color-border);
  }

  .songs-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  /* Error */
  .error-message {
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: rgba(233, 69, 96, 0.1);
    color: var(--color-primary);
    font-size: 0.75rem;
    border-top: 1px solid var(--color-border);
  }

  /* End button */
  .end-btn {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: transparent;
    border: none;
    border-top: 1px solid var(--color-border);
    color: var(--color-primary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .end-btn:hover {
    background-color: rgba(233, 69, 96, 0.1);
  }

  /* Responsive */
  @media (max-width: 480px) {
    .session-overlay {
      bottom: var(--spacing-md);
      right: var(--spacing-md);
      left: var(--spacing-md);
    }

    .session-panel {
      width: 100%;
    }
  }
</style>
