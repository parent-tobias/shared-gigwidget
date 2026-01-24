/**
 * Sync Store
 * Handles bidirectional sync between local IndexedDB and Supabase
 */

import { browser } from '$app/environment';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Song } from '@gigwidget/core';
import {
  supabase,
  saveSongToSupabase,
  loadSongsFromSupabase,
  deleteSongFromSupabase,
  subscribeToSongs,
  unsubscribe,
  fromSupabaseSong,
  getProfile,
  upsertProfile,
  uploadAvatar,
  getPreferences,
  upsertPreferences,
  type SupabaseSong,
  type SongChangePayload,
  type SupabaseProfile,
  type SupabasePreferences,
} from './supabaseStore';
import { getSupabaseUserId, isAuthenticated } from './authStore.svelte';

// ============================================================================
// Types
// ============================================================================

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: Date | null;
  pendingChanges: number;
  error: string | null;
}

// ============================================================================
// Reactive State
// ============================================================================

let syncStatus = $state<SyncStatus>('idle');
let lastSyncAt = $state<Date | null>(null);
let pendingChanges = $state(0);
let syncError = $state<string | null>(null);
let realtimeChannel = $state<RealtimeChannel | null>(null);
let initialized = $state(false);

// ============================================================================
// Sync State Getters
// ============================================================================

export function getSyncState(): SyncState {
  return {
    get status() { return syncStatus; },
    get lastSyncAt() { return lastSyncAt; },
    get pendingChanges() { return pendingChanges; },
    get error() { return syncError; },
  };
}

export function isSyncing(): boolean {
  return syncStatus === 'syncing';
}

// ============================================================================
// Initialize Sync
// ============================================================================

/**
 * Initialize sync when user is authenticated.
 * Call this after auth state changes to SIGNED_IN.
 */
export async function initializeSync(): Promise<void> {
  if (!browser || !isAuthenticated()) {
    console.log('[Sync] Not authenticated, skipping sync initialization');
    return;
  }

  const userId = getSupabaseUserId();
  if (!userId) return;

  console.log('[Sync] Initializing sync for user:', userId);
  initialized = true;

  // Perform initial sync
  await performInitialSync(userId);

  // Subscribe to real-time changes
  setupRealtimeSubscription(userId);
}

/**
 * Stop sync and cleanup subscriptions.
 */
export async function stopSync(): Promise<void> {
  if (realtimeChannel) {
    await unsubscribe(realtimeChannel);
    realtimeChannel = null;
  }
  initialized = false;
  syncStatus = 'idle';
  console.log('[Sync] Sync stopped');
}

// ============================================================================
// Initial Sync
// ============================================================================

/**
 * Perform initial sync: pull from cloud, push local changes.
 */
async function performInitialSync(userId: string): Promise<void> {
  syncStatus = 'syncing';
  syncError = null;

  try {
    const { getDatabase } = await import('@gigwidget/db');
    const db = getDatabase();

    // Get local user
    const users = await db.users.toArray();
    const localUser = users[0];
    if (!localUser) {
      throw new Error('No local user found');
    }

    // Sync profile from cloud (non-blocking - don't fail entire sync if profile sync fails)
    try {
      await syncProfileFromCloud(db, userId, localUser);
    } catch (err) {
      console.error('[Sync] Profile sync failed (continuing):', err);
    }

    // Sync preferences from cloud (non-blocking)
    try {
      await syncPreferencesFromCloud(db, userId, localUser.id);
    } catch (err) {
      console.error('[Sync] Preferences sync failed (continuing):', err);
    }

    // Load songs from Supabase
    console.log('[Sync] Loading songs from cloud...');
    const { data: cloudSongs, error: loadError } = await loadSongsFromSupabase(userId);

    if (loadError) {
      throw new Error(`Failed to load cloud songs: ${loadError}`);
    }

    // Load local songs
    const localSongs = await db.songs.where('ownerId').equals(localUser.id).toArray();
    console.log(`[Sync] Found ${localSongs.length} local songs, ${cloudSongs?.length ?? 0} cloud songs`);

    // Create maps for comparison
    const cloudSongMap = new Map<string, SupabaseSong>();
    cloudSongs?.forEach(s => cloudSongMap.set(s.id, s));

    const localSongMap = new Map<string, Song>();
    localSongs.forEach(s => localSongMap.set(s.id, s));

    // Sync strategy:
    // 1. Songs only in cloud -> pull to local
    // 2. Songs only in local -> push to cloud
    // 3. Songs in both -> compare updated_at, newer wins

    // Pull cloud-only songs to local
    for (const cloudSong of cloudSongs ?? []) {
      if (!localSongMap.has(cloudSong.id)) {
        console.log(`[Sync] Pulling cloud song: ${cloudSong.title}`);
        await pullSongToLocal(db, localUser.id, cloudSong);
      } else {
        // Both exist - compare timestamps
        const localSong = localSongMap.get(cloudSong.id)!;
        const cloudUpdated = new Date(cloudSong.updated_at);
        const localUpdated = new Date(localSong.updatedAt);

        if (cloudUpdated > localUpdated) {
          console.log(`[Sync] Cloud newer, pulling: ${cloudSong.title}`);
          await pullSongToLocal(db, localUser.id, cloudSong);
        } else if (localUpdated > cloudUpdated) {
          console.log(`[Sync] Local newer, pushing: ${localSong.title}`);
          await pushSongToCloud(userId, localSong);
        }
      }
    }

    // Push local-only songs to cloud
    for (const localSong of localSongs) {
      if (!cloudSongMap.has(localSong.id)) {
        console.log(`[Sync] Pushing local song: ${localSong.title}`);
        await pushSongToCloud(userId, localSong);
      }
    }

    lastSyncAt = new Date();
    syncStatus = 'idle';
    pendingChanges = 0;
    console.log('[Sync] Initial sync complete');

  } catch (err) {
    console.error('[Sync] Initial sync failed:', err);
    syncError = err instanceof Error ? err.message : 'Sync failed';
    syncStatus = 'error';
  }
}

// ============================================================================
// Profile & Preferences Sync
// ============================================================================

/**
 * Sync profile from cloud to local.
 * Cloud is source of truth for profile data.
 */
async function syncProfileFromCloud(
  db: Awaited<ReturnType<typeof import('@gigwidget/db').getDatabase>>,
  supabaseUserId: string,
  localUser: { id: string; displayName: string; instruments: string[]; subscriptionTier: string }
): Promise<void> {
  console.log('[Sync] Starting profile sync...');
  const { data: cloudProfile, error: profileError } = await getProfile(supabaseUserId);

  if (profileError) {
    console.error('[Sync] Failed to get cloud profile:', profileError);
    throw profileError;
  }

  if (cloudProfile) {
    // Cloud profile exists - update local
    console.log('[Sync] Syncing profile from cloud');
    await db.users.update(localUser.id, {
      displayName: cloudProfile.display_name,
      instruments: cloudProfile.instruments,
      subscriptionTier: cloudProfile.subscription_tier,
      // Note: avatar_url is a remote URL, we store it differently locally
    });
  } else {
    // No cloud profile - push local to cloud
    console.log('[Sync] Pushing local profile to cloud');
    await upsertProfile(supabaseUserId, {
      display_name: localUser.displayName,
      instruments: localUser.instruments,
      subscription_tier: localUser.subscriptionTier as 'free' | 'basic' | 'pro' | 'mod',
    });
  }
}

/**
 * Sync preferences from cloud to local.
 */
async function syncPreferencesFromCloud(
  db: Awaited<ReturnType<typeof import('@gigwidget/db').getDatabase>>,
  supabaseUserId: string,
  localUserId: string
): Promise<void> {
  console.log('[Sync] Starting preferences sync...');
  const { data: cloudPrefs, error: prefsError } = await getPreferences(supabaseUserId);

  if (prefsError) {
    console.error('[Sync] Failed to get cloud preferences:', prefsError);
    throw prefsError;
  }
  const localPrefs = await db.userPreferences.where('userId').equals(localUserId).first();

  if (cloudPrefs) {
    // Cloud prefs exist - update local
    console.log('[Sync] Syncing preferences from cloud');
    if (localPrefs) {
      await db.userPreferences.update(localPrefs.id || localUserId, {
        chordListPosition: cloudPrefs.chord_list_position,
        theme: cloudPrefs.theme,
        compactView: cloudPrefs.compact_view,
        autoSaveInterval: cloudPrefs.auto_save_interval,
        snapshotRetention: cloudPrefs.snapshot_retention,
      });
    } else {
      await db.userPreferences.add({
        userId: localUserId,
        chordListPosition: cloudPrefs.chord_list_position,
        theme: cloudPrefs.theme,
        compactView: cloudPrefs.compact_view,
        autoSaveInterval: cloudPrefs.auto_save_interval,
        snapshotRetention: cloudPrefs.snapshot_retention,
      });
    }
  } else if (localPrefs) {
    // No cloud prefs but local exists - push to cloud
    console.log('[Sync] Pushing local preferences to cloud');
    await upsertPreferences(supabaseUserId, {
      chord_list_position: localPrefs.chordListPosition,
      theme: localPrefs.theme,
      compact_view: localPrefs.compactView,
      auto_save_interval: localPrefs.autoSaveInterval,
      snapshot_retention: localPrefs.snapshotRetention,
    });
  }
}

// ============================================================================
// Real-time Subscription
// ============================================================================

function setupRealtimeSubscription(userId: string): void {
  console.log('[Sync] Setting up real-time subscription...');

  realtimeChannel = subscribeToSongs(userId, async (payload: SongChangePayload) => {
    console.log('[Sync] Real-time event:', payload.eventType);

    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const users = await db.users.toArray();
      const localUser = users[0];

      if (!localUser) return;

      switch (payload.eventType) {
        case 'INSERT':
        case 'UPDATE':
          if (payload.new) {
            await pullSongToLocal(db, localUser.id, payload.new);
          }
          break;
        case 'DELETE':
          if (payload.old?.id) {
            // Only delete if not modified locally more recently
            const localSong = await db.songs.get(payload.old.id);
            if (localSong) {
              console.log(`[Sync] Deleting local song: ${localSong.title}`);
              await db.songs.delete(payload.old.id);
            }
          }
          break;
      }
    } catch (err) {
      console.error('[Sync] Failed to handle real-time event:', err);
    }
  });
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Pull a cloud song to local IndexedDB.
 */
async function pullSongToLocal(
  db: Awaited<ReturnType<typeof import('@gigwidget/db').getDatabase>>,
  localUserId: string,
  cloudSong: SupabaseSong
): Promise<void> {
  const songData = fromSupabaseSong(cloudSong);

  // Check if song exists locally
  const existingSong = await db.songs.get(cloudSong.id);

  if (existingSong) {
    // Update existing
    await db.songs.update(cloudSong.id, {
      ...songData,
      ownerId: localUserId, // Keep local owner ID
    });
  } else {
    // Create new with required fields
    const { generateId } = await import('@gigwidget/core');
    const newSong: Song = {
      id: cloudSong.id,
      ownerId: localUserId,
      title: cloudSong.title,
      artist: cloudSong.artist ?? undefined,
      key: cloudSong.key as Song['key'],
      tempo: cloudSong.tempo ?? undefined,
      timeSignature: cloudSong.time_signature ?? undefined,
      tags: cloudSong.tags ?? [],
      visibility: cloudSong.visibility,
      spaceIds: [],
      createdAt: new Date(cloudSong.created_at),
      updatedAt: new Date(cloudSong.updated_at),
      yjsDocId: generateId(), // New Yjs doc for this device
    };
    await db.songs.add(newSong);
  }
}

/**
 * Push a local song to Supabase.
 */
async function pushSongToCloud(userId: string, song: Song): Promise<void> {
  // Get arrangement content if available
  const { getDatabase } = await import('@gigwidget/db');
  const db = getDatabase();
  const arrangements = await db.arrangements.where('songId').equals(song.id).toArray();
  const content = arrangements[0]?.content ?? null;

  const { error } = await saveSongToSupabase(userId, song, content ?? undefined);
  if (error) {
    console.error('[Sync] Failed to push song:', error);
    throw error;
  }
}

// ============================================================================
// Manual Sync Triggers (call from app code)
// ============================================================================

/**
 * Sync a specific song to cloud after local edit.
 */
export async function syncSongToCloud(song: Song): Promise<void> {
  if (!isAuthenticated()) return;

  const userId = getSupabaseUserId();
  if (!userId) return;

  pendingChanges++;
  syncStatus = 'syncing';

  try {
    await pushSongToCloud(userId, song);
    pendingChanges = Math.max(0, pendingChanges - 1);
    lastSyncAt = new Date();
    if (pendingChanges === 0) {
      syncStatus = 'idle';
    }
  } catch (err) {
    syncError = err instanceof Error ? err.message : 'Failed to sync';
    syncStatus = 'error';
  }
}

/**
 * Delete a song from cloud.
 */
export async function deleteSongFromCloud(songId: string): Promise<void> {
  if (!isAuthenticated()) return;

  try {
    await deleteSongFromSupabase(songId);
    console.log('[Sync] Song deleted from cloud');
  } catch (err) {
    console.error('[Sync] Failed to delete from cloud:', err);
  }
}

/**
 * Force a full re-sync.
 */
export async function forceSync(): Promise<void> {
  if (!isAuthenticated()) return;

  const userId = getSupabaseUserId();
  if (!userId) return;

  await performInitialSync(userId);
}

/**
 * Sync profile to cloud after local edit.
 */
export async function syncProfileToCloud(profile: {
  displayName: string;
  instruments: string[];
  subscriptionTier: string;
  avatar?: Blob;
}): Promise<{ error?: string }> {
  if (!isAuthenticated()) return { error: 'Not authenticated' };

  const userId = getSupabaseUserId();
  if (!userId) return { error: 'No user ID' };

  try {
    let avatarUrl: string | undefined;

    // Upload avatar if provided
    if (profile.avatar) {
      const { url, error: avatarError } = await uploadAvatar(userId, profile.avatar);
      if (avatarError) {
        console.error('[Sync] Failed to upload avatar:', avatarError);
        // Continue without avatar update
      } else {
        avatarUrl = url;
      }
    }

    // Update profile
    const { error } = await upsertProfile(userId, {
      display_name: profile.displayName,
      instruments: profile.instruments,
      subscription_tier: profile.subscriptionTier as 'free' | 'basic' | 'pro' | 'mod',
      ...(avatarUrl && { avatar_url: avatarUrl }),
    });

    if (error) {
      return { error: String(error) };
    }

    console.log('[Sync] Profile synced to cloud');
    return {};
  } catch (err) {
    console.error('[Sync] Failed to sync profile:', err);
    return { error: err instanceof Error ? err.message : 'Failed to sync profile' };
  }
}

/**
 * Sync preferences to cloud after local edit.
 */
export async function syncPreferencesToCloud(prefs: {
  chordListPosition: 'top' | 'right' | 'bottom';
  theme: 'light' | 'dark' | 'auto';
  compactView: boolean;
  autoSaveInterval?: number;
  snapshotRetention?: number;
}): Promise<{ error?: string }> {
  if (!isAuthenticated()) return { error: 'Not authenticated' };

  const userId = getSupabaseUserId();
  if (!userId) return { error: 'No user ID' };

  try {
    const { error } = await upsertPreferences(userId, {
      chord_list_position: prefs.chordListPosition,
      theme: prefs.theme,
      compact_view: prefs.compactView,
      ...(prefs.autoSaveInterval && { auto_save_interval: prefs.autoSaveInterval }),
      ...(prefs.snapshotRetention && { snapshot_retention: prefs.snapshotRetention }),
    });

    if (error) {
      return { error: String(error) };
    }

    console.log('[Sync] Preferences synced to cloud');
    return {};
  } catch (err) {
    console.error('[Sync] Failed to sync preferences:', err);
    return { error: err instanceof Error ? err.message : 'Failed to sync preferences' };
  }
}
