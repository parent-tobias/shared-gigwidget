<script lang="ts">
  import NavItem from './NavItem.svelte';

  interface Props {
    collapsed?: boolean;
    onToggle?: () => void;
  }

  let { collapsed = false, onToggle }: Props = $props();
</script>

<aside class="sidebar" class:collapsed>
  <div class="sidebar-header">
    {#if collapsed}
      <button class="logo-btn" onclick={onToggle} title="Expand sidebar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
    {:else}
      <h1 class="logo">Gigwidget</h1>
      <button class="collapse-btn" onclick={onToggle} title="Collapse sidebar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
    {/if}
  </div>

  <nav class="sidebar-nav">
    <div class="nav-section">
      <NavItem href="/browse" icon="globe">Browse</NavItem>
      <NavItem href="/library" icon="music">Library</NavItem>
      <NavItem href="/collections" icon="folder">Collections</NavItem>
      <NavItem href="/import" icon="download">Import</NavItem>
    </div>

    <div class="nav-divider"></div>

    <div class="nav-section">
      <NavItem href="/session" icon="users">Sessions</NavItem>
      <NavItem href="/settings" icon="settings">Settings</NavItem>
    </div>
  </nav>

  <div class="sidebar-footer">
    <NavItem href="/settings/account" icon="user">Account</NavItem>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    height: 100%;
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border);
    transition: width var(--transition-normal);
    overflow: hidden;
  }

  .sidebar.collapsed {
    width: var(--sidebar-width-collapsed);
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    height: var(--header-height);
    border-bottom: 1px solid var(--color-border);
  }

  .logo {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-primary);
    white-space: nowrap;
  }

  .logo-btn,
  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    transition: all var(--transition-fast);
  }

  .logo-btn:hover,
  .collapse-btn:hover {
    background-color: var(--color-surface);
    color: var(--color-text);
  }

  .sidebar-nav {
    flex: 1;
    padding: var(--spacing-sm);
    overflow-y: auto;
  }

  .nav-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .nav-divider {
    height: 1px;
    background-color: var(--color-border);
    margin: var(--spacing-md) var(--spacing-sm);
  }

  .sidebar-footer {
    padding: var(--spacing-sm);
    border-top: 1px solid var(--color-border);
  }

  /* Collapsed state - hide labels */
  .sidebar.collapsed .nav-section {
    align-items: center;
  }

  .sidebar.collapsed :global(.nav-label) {
    display: none;
  }

  .sidebar.collapsed :global(.nav-item) {
    justify-content: center;
    padding: var(--spacing-sm);
  }

  .sidebar.collapsed .logo {
    display: none;
  }

  .sidebar.collapsed .sidebar-header {
    justify-content: center;
  }
</style>
