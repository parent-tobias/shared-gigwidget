<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import SessionOverlay from '$lib/components/SessionOverlay.svelte';
  import AppShell from '$lib/components/AppShell.svelte';
  import { getSessionStore } from '$lib/stores/sessionStore.svelte';
  import { initializeAuth } from '$lib/stores/authStore.svelte';
  import { initializeNavigation } from '$lib/stores/navigationStore.svelte';

  let { children } = $props();

  let initialized = $state(false);
  let error = $state<string | null>(null);
  let bootstrapMode = $state(false);

  const sessionStore = getSessionStore();

  // Use $effect instead of onMount for Svelte 5
  $effect(() => {
    if (!browser) return;

    // Run initialization
    (async () => {
      try {
        // Check for bootstrap context first
        const bootstrapCtx = sessionStore.getBootstrapContext();
        if (bootstrapCtx?.bootstrapComplete) {
          bootstrapMode = true;
          await initializeWithBootstrap(bootstrapCtx);
          return;
        }

        const { initializeDatabase } = await import('@gigwidget/db');
        await initializeDatabase();

        // Initialize auth listener
        initializeAuth();

        // Initialize navigation state
        initializeNavigation();

        initialized = true;
      } catch (err) {
        console.error('[Gigwidget] Failed to initialize:', err);
        error = err instanceof Error ? err.message : String(err);
      }
    })();
  });

  /**
   * Initialize the app with bootstrap context.
   * Applies received song data and joins the session.
   */
  async function initializeWithBootstrap(ctx: BootstrapContext): Promise<void> {
    try {
      // Initialize database first
      const { initializeDatabase, getDatabase, SongRepository } = await import('@gigwidget/db');
      const { generateId } = await import('@gigwidget/core');
      await initializeDatabase();

      // Get or create user
      const db = getDatabase();
      const users = await db.users.toArray();
      let user = users[0];

      if (!user) {
        // Create a temporary guest user for bootstrap
        user = {
          id: generateId(),
          displayName: 'Guest',
          instruments: [],
          subscriptionTier: 'free' as const,
          createdAt: new Date(),
        };
        await db.users.add(user);
      }

      // Apply song data if present
      if (ctx.songData && ctx.songData.byteLength > 0) {
        console.log('[Gigwidget] Applying bootstrap song data...');
        await applySongData(ctx.songData);
      }

      // Join the session
      console.log('[Gigwidget] Joining session via bootstrap...');
      await sessionStore.joinWithBootstrapContext(user, ctx);

      console.log('[Gigwidget] Bootstrap complete');
      initialized = true;
    } catch (err) {
      console.error('[Gigwidget] Bootstrap initialization failed:', err);
      error = err instanceof Error ? err.message : 'Bootstrap failed';
    }
  }

  /**
   * Apply received song data from bootstrap.
   */
  async function applySongData(data: ArrayBuffer): Promise<void> {
    try {
      const { decodeSongStates } = await import('@gigwidget/sync');
      const { SongRepository } = await import('@gigwidget/db');

      // Decode the song states
      const entries = decodeSongStates(data);
      console.log(`[Gigwidget] Received ${entries.length} songs from bootstrap`);

      // For each song, we'll need to import it
      // The Yjs states will be synced once the full connection is established
      for (const entry of entries) {
        console.log(`[Gigwidget] Received song state for: ${entry.id}`);
        // Song data will be synced via normal Yjs mechanisms after session join
      }
    } catch (err) {
      console.error('[Gigwidget] Failed to apply song data:', err);
      // Non-fatal - continue without songs
    }
  }
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
  <AppShell>
    {@render children()}
  </AppShell>
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
