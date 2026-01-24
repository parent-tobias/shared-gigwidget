<script lang="ts">
  import { browser } from '$app/environment';
  import type { Snippet } from 'svelte';
  import Sidebar from './Sidebar.svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  // Sidebar state
  let sidebarCollapsed = $state(false);
  let mobileMenuOpen = $state(false);

  // Detect screen size for responsive behavior
  let isMobile = $state(false);
  let isTablet = $state(false);

  $effect(() => {
    if (!browser) return;

    const checkScreenSize = () => {
      isMobile = window.innerWidth < 768;
      isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;

      // Auto-collapse sidebar on tablet
      if (isTablet && !sidebarCollapsed) {
        sidebarCollapsed = true;
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  });

  function toggleSidebar() {
    if (isMobile) {
      mobileMenuOpen = !mobileMenuOpen;
    } else {
      sidebarCollapsed = !sidebarCollapsed;
    }
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }
</script>

<div class="app-shell" class:sidebar-collapsed={sidebarCollapsed} class:mobile={isMobile}>
  {#if isMobile}
    <!-- Mobile: hamburger menu -->
    <header class="mobile-header">
      <button class="hamburger-btn" onclick={toggleSidebar} aria-label="Toggle menu">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <h1 class="mobile-logo">Gigwidget</h1>
    </header>

    {#if mobileMenuOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="mobile-overlay" onclick={closeMobileMenu}></div>
      <div class="mobile-sidebar">
        <Sidebar onToggle={closeMobileMenu} />
      </div>
    {/if}

    <main class="main-content mobile-content">
      {@render children()}
    </main>
  {:else}
    <!-- Desktop/Tablet: persistent sidebar -->
    <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
    <main class="main-content">
      {@render children()}
    </main>
  {/if}
</div>

<style>
  .app-shell {
    display: flex;
    height: 100dvh;
    width: 100%;
    overflow: hidden;
    background-color: var(--color-bg);
  }

  .main-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Mobile styles */
  .app-shell.mobile {
    flex-direction: column;
  }

  .mobile-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    height: var(--header-height);
    background-color: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .hamburger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    transition: background-color var(--transition-fast);
  }

  .hamburger-btn:hover {
    background-color: var(--color-surface);
  }

  .mobile-logo {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-primary);
  }

  .mobile-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 100;
  }

  .mobile-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-width);
    z-index: 101;
    animation: slideIn var(--transition-normal);
  }

  @keyframes slideIn {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .mobile-content {
    flex: 1;
    overflow: auto;
  }

  /* Ensure content scrolls properly */
  .main-content > :global(*) {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
