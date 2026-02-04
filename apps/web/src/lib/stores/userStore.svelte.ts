/**
 * User Store
 * Provides reactive access to the current user's data (profile, avatar, etc.)
 * Components can subscribe to this for real-time updates.
 */

import { browser } from '$app/environment';
import type { User } from '@gigwidget/core';

// ============================================================================
// Reactive State
// ============================================================================

let currentUser = $state<User | null>(null);
let loading = $state(true);
let initialized = false;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the user store by loading from the database
 */
export async function initializeUserStore(): Promise<void> {
  if (!browser) return;

  // Always load user data (don't guard with initialized for initial load)
  await loadUser();
  initialized = true;
}

/**
 * Refresh user data from the database
 * Call this after sync completes to update the UI with synced data
 */
export async function refreshUser(): Promise<void> {
  if (!browser) return;
  await loadUser();
}

/**
 * Internal function to load user from database
 */
async function loadUser(): Promise<void> {
  loading = true;

  try {
    const { getDatabase } = await import('@gigwidget/db');
    const db = getDatabase();
    const users = await db.users.toArray();

    if (users.length > 0) {
      currentUser = users[0];
    } else {
      currentUser = null;
    }
  } catch (err) {
    console.error('[UserStore] Failed to load user:', err);
    currentUser = null;
  } finally {
    loading = false;
  }
}

/**
 * Clear the user store (call on sign out)
 */
export function clearUserStore(): void {
  currentUser = null;
  loading = false;
  initialized = false;
}

// ============================================================================
// Getters (for reactive access)
// ============================================================================

export interface UserStoreState {
  user: User | null;
  loading: boolean;
  isLoggedIn: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  isModerator: boolean;
}

export function getUserStore(): UserStoreState {
  return {
    get user() { return currentUser; },
    get loading() { return loading; },
    get isLoggedIn() { return currentUser !== null && currentUser.supabaseId !== undefined; },
    get displayName() { return currentUser?.displayName ?? null; },
    get avatarUrl() { return currentUser?.avatarUrl ?? null; },
    get isModerator() { return currentUser?.subscriptionTier === 'mod'; },
  };
}
