<script lang="ts">
  import { browser } from '$app/environment';
  import type { User, CustomInstrument } from '@gigwidget/core';
  import {
    isAuthenticated,
  } from '$lib/stores/authStore.svelte';
  import { syncPreferencesToCloud } from '$lib/stores/syncStore.svelte';

  // Built-in instruments that the chordpro-renderer supports
  const RENDERER_INSTRUMENTS = [
    'Standard Guitar',
    'Drop-D Guitar',
    'Standard Ukulele',
    'Baritone Ukulele',
    '5ths tuned Ukulele',
    'Standard Mandolin',
  ] as const;

  let user = $state<User | null>(null);
  let customInstruments = $state<CustomInstrument[]>([]);
  let hasLoaded = false;

  // Preferences state
  let defaultInstrument = $state<string>('');
  let chordListPosition = $state<'top' | 'right' | 'bottom'>('top');
  let theme = $state<'light' | 'dark' | 'auto'>('auto');
  let compactView = $state(false);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadData();
  });

  async function loadData() {
    try {
      const { getDatabase, CustomInstrumentRepository } = await import('@gigwidget/db');
      const db = getDatabase();
      const users = await db.users.toArray();
      if (users.length > 0) {
        user = users[0];
        customInstruments = await CustomInstrumentRepository.getByUser(users[0].id);

        const prefs = await db.userPreferences.where('userId').equals(users[0].id).first();
        if (prefs) {
          if (prefs.defaultInstrument) defaultInstrument = prefs.defaultInstrument;
          if (prefs.chordListPosition) chordListPosition = prefs.chordListPosition;
          if (prefs.theme) theme = prefs.theme;
          if (prefs.compactView) compactView = prefs.compactView;
        }
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    } finally {
      loading = false;
    }
  }

  async function savePreferences() {
    if (!user) return;

    saving = true;
    error = null;
    success = false;

    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      const prefs = await db.userPreferences.where('userId').equals(user.id).first();
      const prefsData = {
        defaultInstrument: defaultInstrument || undefined,
        chordListPosition,
        theme,
        compactView,
      };
      if (prefs) {
        await (db.userPreferences.where('userId').equals(user.id).modify as any)(prefsData);
      } else {
        await (db.userPreferences.add as any)({
          userId: user.id,
          autoSaveInterval: 5000,
          snapshotRetention: 10,
          ...prefsData,
        });
      }

      // Sync to cloud if authenticated
      if (isAuthenticated()) {
        const { error: syncError } = await syncPreferencesToCloud({
          defaultInstrument: defaultInstrument || undefined,
          chordListPosition,
          theme,
          compactView,
        });
        if (syncError) {
          console.warn('Preferences saved locally but cloud sync failed:', syncError);
        }
      }

      success = true;
      setTimeout(() => { success = false; }, 3000);
    } catch (err) {
      console.error('Failed to save preferences:', err);
      error = err instanceof Error ? err.message : 'Failed to save preferences';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Preferences - Gigwidget</title>
</svelte:head>

<div class="preferences-page">
  <header class="page-header">
    <h1>Preferences</h1>
    <p class="page-desc">Configure how songs are displayed in the viewer.</p>
  </header>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}
  {#if success}
    <div class="success-message">Preferences saved!</div>
  {/if}

  {#if loading}
    <div class="loading">Loading preferences...</div>
  {:else}
    <form class="preferences-form" onsubmit={(e) => { e.preventDefault(); savePreferences(); }}>
      <div class="form-group">
        <label for="defaultInstrument">Default Instrument</label>
        <select
          id="defaultInstrument"
          bind:value={defaultInstrument}
          disabled={saving}
        >
          <option value="">None</option>
          <optgroup label="Built-in Instruments">
            {#each RENDERER_INSTRUMENTS as instrument}
              <option value={instrument}>{instrument}</option>
            {/each}
          </optgroup>
          {#if customInstruments.length > 0}
            <optgroup label="Custom Instruments">
              {#each customInstruments as instrument}
                <option value={instrument.id}>{instrument.name}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
        <p class="form-help">Instrument used for chord diagrams when viewing songs.</p>
      </div>

      <div class="form-group">
        <label for="chordListPosition">Chord List Position</label>
        <select
          id="chordListPosition"
          bind:value={chordListPosition}
          disabled={saving}
        >
          <option value="top">Top</option>
          <option value="right">Right</option>
          <option value="bottom">Bottom</option>
        </select>
        <p class="form-help">Where chord diagrams appear when viewing songs.</p>
      </div>

      <div class="form-group">
        <label for="theme">Theme</label>
        <select
          id="theme"
          bind:value={theme}
          disabled={saving}
        >
          <option value="auto">Auto (system preference)</option>
          <option value="light">Light Mode</option>
          <option value="dark">Dark Mode</option>
        </select>
        <p class="form-help">Your preferred color theme for the app.</p>
      </div>

      <div class="form-group checkbox-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            bind:checked={compactView}
            disabled={saving}
          />
          <span>Compact View</span>
        </label>
        <p class="form-help">Use a more compact UI layout with reduced spacing.</p>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .preferences-page {
    max-width: 600px;
  }

  .page-header {
    margin-bottom: var(--spacing-lg);
  }

  .page-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: var(--spacing-xs);
  }

  .page-desc {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: 0;
  }

  .preferences-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .form-group label {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .form-help {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .checkbox-group {
    gap: var(--spacing-xs);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    font-weight: 400;
    font-size: 0.875rem;
  }

  .checkbox-label input {
    width: auto;
    cursor: pointer;
  }

  .form-actions {
    padding-top: var(--spacing-md);
  }

  .success-message {
    background-color: rgba(74, 222, 128, 0.1);
    border: 1px solid #4ade80;
    color: #4ade80;
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }
</style>
