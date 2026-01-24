<script lang="ts">
  import { getAuthState } from '$lib/stores/authStore.svelte';

  const auth = getAuthState();
</script>

<svelte:head>
  <title>Settings - Gigwidget</title>
</svelte:head>

<div class="settings-overview">
  <header class="page-header">
    <h1>Settings</h1>
  </header>

  <div class="settings-cards">
    <a href="/settings/account" class="settings-card">
      <div class="card-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <div class="card-content">
        <h3>Account</h3>
        <p>Manage your profile, avatar, and authentication settings.</p>
        {#if auth.profile}
          <span class="card-detail">{auth.profile.display_name}</span>
        {/if}
      </div>
      <span class="card-arrow">→</span>
    </a>

    <a href="/settings/preferences" class="settings-card">
      <div class="card-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="21" x2="4" y2="14"/>
          <line x1="4" y1="10" x2="4" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12" y2="3"/>
          <line x1="20" y1="21" x2="20" y2="16"/>
          <line x1="20" y1="12" x2="20" y2="3"/>
          <line x1="1" y1="14" x2="7" y2="14"/>
          <line x1="9" y1="8" x2="15" y2="8"/>
          <line x1="17" y1="16" x2="23" y2="16"/>
        </svg>
      </div>
      <div class="card-content">
        <h3>Preferences</h3>
        <p>Configure default instrument, theme, and viewer settings.</p>
      </div>
      <span class="card-arrow">→</span>
    </a>

    <a href="/settings/instruments" class="settings-card">
      <div class="card-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11.9 12.1a3.5 3.5 0 1 0-4.95 4.95 3.5 3.5 0 0 0 4.95-4.95z"/>
          <path d="M18.4 2.6a2.17 2.17 0 0 1 3 3L16 11l-4-4 5.4-5.4z"/>
          <path d="M18.4 2.6L22 6"/>
          <path d="M12 11l-1.5 1.5"/>
          <path d="m5 19 3-3"/>
          <path d="M2 22l3-3"/>
        </svg>
      </div>
      <div class="card-content">
        <h3>Custom Instruments</h3>
        <p>Create and manage custom tunings for your instruments.</p>
      </div>
      <span class="card-arrow">→</span>
    </a>
  </div>
</div>

<style>
  .settings-overview {
    max-width: 800px;
  }

  .page-header {
    margin-bottom: var(--spacing-lg);
  }

  .page-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
  }

  .settings-cards {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .settings-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md) var(--spacing-lg);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--color-text);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .settings-card:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background-color: var(--color-bg);
    border-radius: var(--radius-sm);
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .card-content {
    flex: 1;
  }

  .card-content h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: var(--spacing-xs);
  }

  .card-content p {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .card-detail {
    display: inline-block;
    margin-top: var(--spacing-xs);
    font-size: 0.75rem;
    color: var(--color-text-muted);
    background-color: var(--color-bg);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
  }

  .card-arrow {
    font-size: 1.25rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  @media (max-width: 480px) {
    .settings-card {
      padding: var(--spacing-sm) var(--spacing-md);
    }

    .card-icon {
      width: 40px;
      height: 40px;
    }
  }
</style>
