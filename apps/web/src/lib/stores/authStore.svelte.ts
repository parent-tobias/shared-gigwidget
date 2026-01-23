/**
 * Supabase Auth Store
 * Manages authentication state with magic link login via Resend
 */

import { browser } from '$app/environment';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseStore';

// ============================================================================
// Types
// ============================================================================

export interface AuthState {
  user: SupabaseUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// Reactive State (Svelte 5 Runes)
// ============================================================================

let authUser = $state<SupabaseUser | null>(null);
let authSession = $state<Session | null>(null);
let authLoading = $state(true);
let authError = $state<string | null>(null);

// ============================================================================
// Initialize Auth Listener
// ============================================================================

let initialized = false;

export function initializeAuth(): void {
  if (!browser || initialized) return;
  initialized = true;

  // Get initial session
  console.log('[Auth] Calling getSession...');
  supabase.auth.getSession().then(async ({ data: { session }, error }) => {
    console.log('[Auth] getSession completed:', { hasSession: !!session, error: error?.message });
    if (error) {
      console.error('[Auth] Error getting session:', error);
      authError = error.message;
    } else {
      authSession = session;
      authUser = session?.user ?? null;

      // If already logged in, start sync
      if (session?.user) {
        console.log('[Auth] Existing session found, initializing sync...');
        await linkToLocalUser(session.user.id);
        const { initializeSync } = await import('./syncStore.svelte');
        await initializeSync();
      }
    }
    authLoading = false;
  }).catch((err) => {
    console.error('[Auth] getSession threw:', err);
    authError = err?.message || 'Failed to get session';
    authLoading = false;
  });

  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth] State changed:', event);
    authSession = session;
    authUser = session?.user ?? null;
    authError = null;

    // Link to local user and start sync when signed in
    if (event === 'SIGNED_IN' && session?.user) {
      await linkToLocalUser(session.user.id);
      // Start sync after linking user
      const { initializeSync } = await import('./syncStore.svelte');
      await initializeSync();
    }

    // Stop sync when signed out
    if (event === 'SIGNED_OUT') {
      const { stopSync } = await import('./syncStore.svelte');
      await stopSync();
    }
  });
}

// ============================================================================
// Auth Functions
// ============================================================================

/**
 * Send a magic link to the user's email
 */
export async function sendMagicLink(email: string): Promise<{ error: string | null }> {
  authLoading = true;
  authError = null;

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: browser ? `${window.location.origin}/account` : undefined,
      },
    });

    if (error) {
      authError = error.message;
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send magic link';
    authError = message;
    return { error: message };
  } finally {
    authLoading = false;
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  authLoading = true;
  authError = null;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      authError = error.message;
      console.error('[Auth] Sign out error:', error);
    }
  } catch (err) {
    authError = err instanceof Error ? err.message : 'Failed to sign out';
  } finally {
    authLoading = false;
  }
}

/**
 * Link the Supabase user ID to the local IndexedDB user
 */
async function linkToLocalUser(supabaseId: string): Promise<void> {
  try {
    const { getDatabase } = await import('@gigwidget/db');
    const db = getDatabase();

    const users = await db.users.toArray();
    if (users.length > 0) {
      const localUser = users[0];
      if (localUser.supabaseId !== supabaseId) {
        await db.users.update(localUser.id, {
          supabaseId,
          lastSyncAt: new Date(),
        });
        console.log('[Auth] Linked Supabase user to local user');
      }
    }
  } catch (err) {
    console.error('[Auth] Failed to link local user:', err);
  }
}

// ============================================================================
// Getters (for reactive access)
// ============================================================================

export function getAuthState(): AuthState {
  return {
    get user() { return authUser; },
    get session() { return authSession; },
    get loading() { return authLoading; },
    get error() { return authError; },
  };
}

export function isAuthenticated(): boolean {
  return authUser !== null;
}

export function getSupabaseUserId(): string | null {
  return authUser?.id ?? null;
}

export function getSupabaseEmail(): string | null {
  return authUser?.email ?? null;
}
