<script lang="ts">
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  const settingsLinks = [
    { href: '/settings', label: 'Overview', icon: 'settings' },
    { href: '/settings/account', label: 'Account', icon: 'user' },
    { href: '/settings/preferences', label: 'Preferences', icon: 'sliders' },
    { href: '/settings/instruments', label: 'Instruments', icon: 'guitar' },
  ];

  function isActive(href: string): boolean {
    if (href === '/settings') {
      return $page.url.pathname === '/settings';
    }
    return $page.url.pathname.startsWith(href);
  }
</script>

<div class="settings-layout">
  <nav class="settings-nav">
    <h2>Settings</h2>
    <ul>
      {#each settingsLinks as link}
        <li>
          <a
            href={link.href}
            class:active={isActive(link.href)}
          >
            <span class="icon">
              {#if link.icon === 'settings'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              {:else if link.icon === 'user'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              {:else if link.icon === 'sliders'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
              {:else if link.icon === 'guitar'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11.9 12.1a3.5 3.5 0 1 0-4.95 4.95 3.5 3.5 0 0 0 4.95-4.95z"/>
                  <path d="M18.4 2.6a2.17 2.17 0 0 1 3 3L16 11l-4-4 5.4-5.4z"/>
                  <path d="M18.4 2.6L22 6"/>
                  <path d="M12 11l-1.5 1.5"/>
                  <path d="m5 19 3-3"/>
                  <path d="M2 22l3-3"/>
                </svg>
              {/if}
            </span>
            {link.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <main class="settings-content">
    {@render children()}
  </main>
</div>

<style>
  .settings-layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    height: 100%;
    background-color: var(--color-bg);
  }

  .settings-nav {
    padding: var(--spacing-md);
    border-right: 1px solid var(--color-border);
    background-color: var(--color-bg-secondary);
  }

  .settings-nav h2 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: var(--spacing-md);
    padding: 0 var(--spacing-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .settings-nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .settings-nav a {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    text-decoration: none;
    font-size: 0.9rem;
    transition: background-color 0.15s ease;
  }

  .settings-nav a:hover {
    background-color: var(--color-bg-hover);
  }

  .settings-nav a.active {
    background-color: var(--color-primary);
    color: white;
  }

  .settings-nav .icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .settings-content {
    overflow-y: auto;
    padding: var(--spacing-lg);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .settings-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }

    .settings-nav {
      border-right: none;
      border-bottom: 1px solid var(--color-border);
      padding: var(--spacing-sm);
    }

    .settings-nav h2 {
      display: none;
    }

    .settings-nav ul {
      flex-direction: row;
      overflow-x: auto;
      gap: var(--spacing-xs);
    }

    .settings-nav a {
      white-space: nowrap;
      padding: var(--spacing-xs) var(--spacing-sm);
    }

    .settings-content {
      padding: var(--spacing-md);
    }
  }
</style>
