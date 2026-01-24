<script lang="ts">
  // Browse page - public songs from the community
  // Placeholder for now
</script>

<svelte:head>
  <title>Browse - Gigwidget</title>
</svelte:head>

<div class="browse-page">
  <header class="page-header">
    <h1>Browse</h1>
  </header>

  <div class="placeholder">
    <div class="placeholder-icon">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    </div>
    <h2>Coming Soon</h2>
    <p>Browse public songs shared by the community.</p>
    <p class="hint">This feature is under development.</p>
  </div>
</div>

<style>
  .browse-page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg);
    flex-shrink: 0;
  }

  .page-header h1 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--spacing-xl);
  }

  .placeholder-icon {
    color: var(--color-border);
  }

  .placeholder h2 {
    font-size: 1.5rem;
    color: var(--color-text);
  }

  .placeholder .hint {
    font-size: 0.875rem;
    opacity: 0.7;
  }
</style>
