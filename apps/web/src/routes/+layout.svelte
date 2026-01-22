<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import SessionOverlay from '$lib/components/SessionOverlay.svelte';

  let { children } = $props();

  let initialized = $state(false);
  let error = $state<string | null>(null);

  // Use $effect instead of onMount for Svelte 5
  $effect(() => {
    if (!browser) return;

    console.log('[Gigwidget] $effect running in browser');

    // Run initialization
    (async () => {
      try {
        console.log('[Gigwidget] Importing @gigwidget/db...');
        const { initializeDatabase } = await import('@gigwidget/db');
        console.log('[Gigwidget] Import successful, calling initializeDatabase...');
        await initializeDatabase();
        console.log('[Gigwidget] Database initialized');
        initialized = true;
      } catch (err) {
        console.error('[Gigwidget] Failed to initialize:', err);
        error = err instanceof Error ? err.message : String(err);
      }
    })();
  });
</script>

{#if error}
  <div class="error-container">
    <h1>Failed to Initialize</h1>
    <p>{error}</p>
    <button onclick={() => window.location.reload()}>Retry</button>
  </div>
{:else if !initialized}
  <div class="loading-container">
    <div class="spinner"></div>
    <p>Loading Gigwidget...</p>
  </div>
{:else}
  {@render children()}
  <SessionOverlay />
{/if}

<style>
  .loading-container,
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 1rem;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #2a2a4e;
    border-top-color: #e94560;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-container {
    text-align: center;
  }
</style>
