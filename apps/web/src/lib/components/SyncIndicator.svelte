<script lang="ts">
  import { browser } from '$app/environment';

  type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

  interface Props {
    status?: SyncStatus;
    peerCount?: number;
    compact?: boolean;
  }

  let { status = 'offline', peerCount = 0, compact = false }: Props = $props();

  const statusConfig = {
    synced: { label: 'Synced', icon: '●', color: 'var(--color-success, #4ade80)' },
    syncing: { label: 'Syncing...', icon: '◐', color: 'var(--color-warning, #fbbf24)' },
    offline: { label: 'Offline', icon: '○', color: 'var(--color-text-muted)' },
    error: { label: 'Sync Error', icon: '✕', color: 'var(--color-primary)' },
  } as const;

  const config = $derived(statusConfig[status]);
</script>

<div class="sync-indicator" class:compact style="--status-color: {config.color}">
  <span class="status-icon" class:syncing={status === 'syncing'}>{config.icon}</span>
  {#if !compact}
    <span class="status-label">{config.label}</span>
  {/if}
  {#if peerCount > 0}
    <span class="peer-count" title="{peerCount} connected peer{peerCount > 1 ? 's' : ''}">
      {peerCount}
    </span>
  {/if}
</div>

<style>
  .sync-indicator {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs, 0.25rem);
    padding: var(--spacing-xs, 0.25rem) var(--spacing-sm, 0.5rem);
    background-color: var(--color-bg-secondary, #16213e);
    border-radius: var(--radius-md, 0.5rem);
    font-size: 0.75rem;
    color: var(--color-text-muted, #a0a0a0);
  }

  .sync-indicator.compact {
    padding: var(--spacing-xs, 0.25rem);
  }

  .status-icon {
    color: var(--status-color);
    font-size: 0.875rem;
  }

  .status-icon.syncing {
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .status-label {
    font-weight: 500;
  }

  .peer-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 var(--spacing-xs, 0.25rem);
    background-color: var(--color-surface, #0f3460);
    border-radius: var(--radius-sm, 0.25rem);
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--color-text, #eaeaea);
  }
</style>
