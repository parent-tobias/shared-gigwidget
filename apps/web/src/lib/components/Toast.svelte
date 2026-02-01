<script lang="ts">
  import { toast, type Toast } from '$lib/stores/toastStore.svelte';

  const toasts = $derived(toast.all);
</script>

<div class="toast-container">
  {#each toasts as t (t.id)}
    <div class="toast toast-{t.type}" role="alert">
      <div class="toast-content">
        <span class="toast-icon">
          {#if t.type === 'success'}
            ✓
          {:else if t.type === 'error'}
            ✕
          {:else if t.type === 'warning'}
            ⚠
          {:else}
            ℹ
          {/if}
        </span>
        <span class="toast-message">{t.message}</span>
      </div>
      <button class="toast-close" onclick={() => toast.dismiss(t.id)} aria-label="Close">
        ✕
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: var(--spacing-lg);
    right: var(--spacing-lg);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(120%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast-content {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
  }

  .toast-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .toast-message {
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .toast-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: var(--spacing-xs);
    font-size: 1rem;
    line-height: 1;
    transition: color var(--transition-fast);
    flex-shrink: 0;
  }

  .toast-close:hover {
    color: var(--color-text);
  }

  /* Toast type styles */
  .toast-info {
    border-left: 3px solid #3b82f6;
  }

  .toast-info .toast-icon {
    color: #3b82f6;
  }

  .toast-success {
    border-left: 3px solid #10b981;
  }

  .toast-success .toast-icon {
    color: #10b981;
  }

  .toast-warning {
    border-left: 3px solid #f59e0b;
  }

  .toast-warning .toast-icon {
    color: #f59e0b;
  }

  .toast-error {
    border-left: 3px solid #ef4444;
  }

  .toast-error .toast-icon {
    color: #ef4444;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .toast-container {
      left: var(--spacing-md);
      right: var(--spacing-md);
      bottom: var(--spacing-md);
      max-width: none;
    }
  }
</style>
