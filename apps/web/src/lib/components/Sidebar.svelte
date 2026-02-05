<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import NavItem from './NavItem.svelte';
  import { getUserStore, initializeUserStore } from '$lib/stores/userStore.svelte';

  interface Props {
    collapsed?: boolean;
    onToggle?: () => void;
  }

  let { collapsed = false, onToggle }: Props = $props();

  // Get reactive user store
  const userStore = getUserStore();

  // Initialize user store on mount
  $effect(() => {
    if (browser) {
      initializeUserStore();
    }
  });

  // Determine if account link is active
  const isAccountActive = $derived(
    $page.url.pathname === '/settings/account' ||
    $page.url.pathname.startsWith('/settings/account/')
  );
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

    {#if userStore.isModerator}
      <div class="nav-divider"></div>

      <div class="nav-section">
        <span class="nav-section-label" class:hidden={collapsed}>Admin</span>
        <NavItem href="/admin/users" icon="shield">Users</NavItem>
        <NavItem href="/admin/songs" icon="database">Songs</NavItem>
        <NavItem href="/admin/system-chords" icon="grid">Chords</NavItem>
        <NavItem href="/admin/instruments" icon="guitar">Instruments</NavItem>
      </div>
    {/if}
  </nav>

  <div class="sidebar-footer">
    {#if userStore.isLoggedIn && userStore.displayName}
      <!-- Show user avatar and name when logged in -->
      <a
        href="/settings/account"
        class="account-link"
        class:active={isAccountActive}
        aria-current={isAccountActive ? 'page' : undefined}
      >
        {#if userStore.avatarUrl}
          <img src={userStore.avatarUrl} alt="" class="user-avatar" />
        {:else}
          <span class="user-avatar-placeholder">
            {userStore.displayName.charAt(0).toUpperCase()}
          </span>
        {/if}
        {#if !collapsed}
          <span class="user-name">{userStore.displayName}</span>
        {/if}
      </a>
    {:else}
      <NavItem href="/settings/account" icon="user">Account</NavItem>
    {/if}
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

  .nav-section-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    padding: var(--spacing-xs) var(--spacing-md);
    margin-bottom: var(--spacing-xs);
  }

  .nav-section-label.hidden {
    display: none;
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

  /* User account link with avatar */
  .account-link {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    text-decoration: none;
    transition: all var(--transition-fast);
    font-weight: 500;
    font-size: 0.9375rem;
  }

  .account-link:hover {
    background-color: var(--color-surface);
    color: var(--color-text);
  }

  .account-link.active {
    background-color: var(--color-primary);
    color: white;
  }

  .account-link.active:hover {
    background-color: var(--color-primary);
    filter: brightness(1.1);
  }

  .user-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .user-avatar-placeholder {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .account-link.active .user-avatar-placeholder {
    background-color: white;
    color: var(--color-primary);
  }

  .user-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Collapsed state for account link */
  .sidebar.collapsed .account-link {
    justify-content: center;
    padding: var(--spacing-sm);
  }

  .sidebar.collapsed .user-name {
    display: none;
  }
</style>
