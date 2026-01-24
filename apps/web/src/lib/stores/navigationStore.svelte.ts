/**
 * Navigation Store
 * Manages app-wide navigation and selection state
 */

import { browser } from '$app/environment';

// ============================================================================
// Types
// ============================================================================

export type AppSection = 'browse' | 'library' | 'collections' | 'settings';

// ============================================================================
// State
// ============================================================================

// Sidebar state
let sidebarCollapsed = $state(false);
let mobileMenuOpen = $state(false);

// Selection state (for list panes)
let selectedSongId = $state<string | null>(null);
let selectedCollectionId = $state<string | null>(null);

// ============================================================================
// Getters
// ============================================================================

export function getNavigationState() {
  return {
    get sidebarCollapsed() {
      return sidebarCollapsed;
    },
    get mobileMenuOpen() {
      return mobileMenuOpen;
    },
    get selectedSongId() {
      return selectedSongId;
    },
    get selectedCollectionId() {
      return selectedCollectionId;
    },
  };
}

// ============================================================================
// Actions
// ============================================================================

export function toggleSidebar(): void {
  sidebarCollapsed = !sidebarCollapsed;

  // Persist preference
  if (browser) {
    localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
  }
}

export function setSidebarCollapsed(collapsed: boolean): void {
  sidebarCollapsed = collapsed;
}

export function toggleMobileMenu(): void {
  mobileMenuOpen = !mobileMenuOpen;
}

export function closeMobileMenu(): void {
  mobileMenuOpen = false;
}

export function selectSong(id: string | null): void {
  selectedSongId = id;
}

export function selectCollection(id: string | null): void {
  selectedCollectionId = id;
}

// ============================================================================
// Initialization
// ============================================================================

export function initializeNavigation(): void {
  if (!browser) return;

  // Load saved sidebar state
  const savedCollapsed = localStorage.getItem('sidebar-collapsed');
  if (savedCollapsed !== null) {
    sidebarCollapsed = savedCollapsed === 'true';
  }
}
