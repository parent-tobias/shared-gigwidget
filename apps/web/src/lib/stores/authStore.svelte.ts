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
  supabase.auth.getSession().then(async ({ data: { session }, error }) => {
    if (error) {
      console.error('[Auth] Error getting session:', error);
      authError = error.message;
    } else {
      authSession = session;
      authUser = session?.user ?? null;

      // If already logged in, initialize authenticated user and start sync
      if (session?.user) {
        await initializeAuthenticatedUser(session.user.id);
        // Start sync in background (don't await - could take a long time with many songs)
        import('./syncStore.svelte').then(({ initializeSync }) => {
          initializeSync().catch(err => console.error('[Auth] Background sync failed:', err));
        });
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
    authSession = session;
    authUser = session?.user ?? null;
    authError = null;

    // Clear anonymous data and initialize authenticated user when signed in
    if (event === 'SIGNED_IN' && session?.user) {
      await initializeAuthenticatedUser(session.user.id);
      // Start sync in background (don't await - could take a long time with many songs)
      import('./syncStore.svelte').then(({ initializeSync }) => {
        initializeSync().catch(err => console.error('[Auth] Background sync failed:', err));
      });
    }

    // Stop sync and clear database when signed out
    if (event === 'SIGNED_OUT') {
      const { stopSync } = await import('./syncStore.svelte');
      await stopSync();

      // Clear all local data when logging out
      const { clearDatabase } = await import('@gigwidget/db');
      await clearDatabase();
      console.log('[Auth] Local database cleared on sign out');

      // Reload the page to reset app state
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
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
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  authLoading = true;
  authError = null;

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Redirect to account page after OAuth (not /auth/confirm which is for magic links)
        redirectTo: browser ? `${window.location.origin}/settings/account` : undefined,
      },
    });

    if (error) {
      authError = error.message;
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sign in with Google';
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

// ============================================================================
// Password Validation
// ============================================================================

// Common words/names to reject (lowercase)
const COMMON_WORDS = new Set([
  'password', 'qwerty', 'letmein', 'welcome', 'admin', 'login',
  'master', 'dragon', 'monkey', 'shadow', 'sunshine', 'princess',
  'football', 'baseball', 'soccer', 'hockey', 'batman', 'superman',
]);

export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password strength
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one digit
 * - At least one symbol
 * - No common words/names
 */
export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one digit');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push('Password must contain at least one symbol');
  }

  // Check for common words (case-insensitive)
  const lowerPassword = password.toLowerCase();
  for (const word of COMMON_WORDS) {
    if (lowerPassword.includes(word)) {
      errors.push('Password contains a common word or name');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Email/Password Auth
// ============================================================================

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ error: string | null; needsVerification: boolean }> {
  authLoading = true;
  authError = null;

  try {
    // Validate password first
    const validation = validatePassword(password);
    if (!validation.valid) {
      const errorMsg = validation.errors.join('. ');
      authError = errorMsg;
      return { error: errorMsg, needsVerification: false };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: browser ? `${window.location.origin}/settings/account` : undefined,
      },
    });

    if (error) {
      authError = error.message;
      return { error: error.message, needsVerification: false };
    }

    // Supabase returns user but with identities = [] if email needs verification
    // If email confirmation is required, user won't have a session yet
    const needsVerification = data.user && !data.session;

    return { error: null, needsVerification };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sign up';
    authError = message;
    return { error: message, needsVerification: false };
  } finally {
    authLoading = false;
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ error: string | null }> {
  authLoading = true;
  authError = null;

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      authError = error.message;
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sign in';
    authError = message;
    return { error: message };
  } finally {
    authLoading = false;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  authLoading = true;
  authError = null;

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: browser ? `${window.location.origin}/auth/reset-password` : undefined,
    });

    if (error) {
      authError = error.message;
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send reset email';
    authError = message;
    return { error: message };
  } finally {
    authLoading = false;
  }
}

/**
 * Update password (after reset or for logged-in user)
 */
export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  authLoading = true;
  authError = null;

  try {
    // Validate new password
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      const errorMsg = validation.errors.join('. ');
      authError = errorMsg;
      return { error: errorMsg };
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      authError = error.message;
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update password';
    authError = message;
    return { error: message };
  } finally {
    authLoading = false;
  }
}

/**
 * Initialize authenticated user by clearing anonymous data and creating fresh user.
 * This ensures no anonymous data persists after login.
 */
async function initializeAuthenticatedUser(supabaseId: string): Promise<void> {
  try {
    const { clearDatabase, initializeDatabase, getDatabase } = await import('@gigwidget/db');
    const { createSpace, generateId } = await import('@gigwidget/core');
    const db = getDatabase();

    // Check if we already have this authenticated user
    const users = await db.users.toArray();
    const existingAuthUser = users.find(u => u.supabaseId === supabaseId);

    if (existingAuthUser) {
      // Already initialized for this auth user, nothing to do
      console.log('[Auth] Authenticated user already initialized');
      return;
    }

    // Clear all anonymous data
    console.log('[Auth] Clearing anonymous user data...');
    await clearDatabase();

    // Initialize new authenticated user
    // initializeDatabase creates an anonymous user, but we'll update it with the Supabase ID
    const user = await initializeDatabase();

    await db.users.update(user.id, {
      supabaseId,
      lastSyncAt: new Date(),
    });

    console.log('[Auth] Initialized authenticated user, ready to sync from cloud');
  } catch (err) {
    console.error('[Auth] Failed to initialize authenticated user:', err);
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
