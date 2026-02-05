import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Song, SongType, Visibility } from '@gigwidget/core';

// ============================================================================
// Supabase Client Setup
// ============================================================================

let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
  }
  return _supabase;
}

// For backwards compatibility - lazy getter
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseClient() as any)[prop];
  },
});

// ============================================================================
// Types for Supabase Tables
// ============================================================================

export interface SupabaseProfile {
  id: string;
  display_name: string;
  instruments: string[];
  avatar_url: string | null;
  subscription_tier: 'free' | 'basic' | 'pro' | 'mod';
  created_at: string;
  updated_at: string;
}

export interface SupabasePreferences {
  user_id: string;
  /** Renderer instrument name (e.g., "Standard Guitar") or custom instrument ID */
  default_instrument: string | null;
  chord_list_position: 'top' | 'right' | 'bottom';
  theme: 'light' | 'dark' | 'auto';
  compact_view: boolean;
  auto_save_interval: number;
  snapshot_retention: number;
  created_at: string;
  updated_at: string;
}

export interface SupabaseSong {
  id: string;
  user_id: string;
  title: string;
  artist: string | null;
  key: string | null;
  tempo: number | null;
  time_signature: [number, number] | null;
  tags: string[];
  visibility: Visibility;
  content: string | null;
  created_at: string;
  updated_at: string;
  // Song lineage fields (added in schema v4)
  type: SongType;
  source_id: string | null;
  forked_from_id: string | null;
}

/**
 * Convert a local Song to Supabase format
 */
function toSupabaseSong(userId: string, song: Song, content?: string): Partial<SupabaseSong> {
  return {
    id: song.id,
    user_id: userId,
    title: song.title,
    artist: song.artist ?? null,
    key: song.key ?? null,
    tempo: song.tempo ?? null,
    time_signature: song.timeSignature ?? null,
    tags: song.tags ?? [],
    visibility: song.visibility,
    content: content ?? null,
    updated_at: new Date().toISOString(),
    // Song lineage fields
    type: song.type ?? 'original',
    source_id: song.sourceId ?? null,
    forked_from_id: song.forkedFromId ?? null,
  };
}

/**
 * Convert a Supabase song to local Song format
 */
export function fromSupabaseSong(row: SupabaseSong): Partial<Song> {
  return {
    id: row.id,
    ownerId: row.user_id,
    title: row.title,
    artist: row.artist ?? undefined,
    key: row.key as Song['key'],
    tempo: row.tempo ?? undefined,
    timeSignature: row.time_signature ?? undefined,
    tags: row.tags ?? [],
    visibility: row.visibility,
    updatedAt: new Date(row.updated_at),
    createdAt: new Date(row.created_at),
    // Song lineage fields
    type: row.type ?? 'original',
    sourceId: row.source_id ?? undefined,
    forkedFromId: row.forked_from_id ?? undefined,
  };
}

/**
 * Save a song to Supabase
 */
export async function saveSongToSupabase(
  userId: string,
  song: Song,
  content?: string
): Promise<{ data?: SupabaseSong; error?: unknown }> {
  try {
    const payload = toSupabaseSong(userId, song, content);

    // Debug: Log what we're sending
    const contentLen = payload.content?.length ?? 0;
    if (contentLen > 0) {
      console.log(`[Supabase] Saving "${song.title}" with content (${contentLen} chars)`);
    } else {
      console.warn(`[Supabase] Saving "${song.title}" with NO content. Input content param: ${content?.length ?? 'undefined'} chars`);
    }

    const { data, error } = await supabase
      .from('songs')
      .upsert(payload, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving song to Supabase:', error);
      return { error };
    }

    // Verify content was saved
    if (contentLen > 0 && !data.content) {
      console.error(`[Supabase] BUG: Content was sent but not saved! Sent ${contentLen} chars, got back null`);
    }

    return { data };
  } catch (err) {
    console.error('Exception saving song:', err);
    return { error: err };
  }
}

/**
 * Load songs from Supabase for a user
 */
export async function loadSongsFromSupabase(
  userId: string
): Promise<{ data?: SupabaseSong[]; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading songs from Supabase:', error);
      return { error };
    }

    console.log(`Loaded ${data?.length || 0} songs from Supabase`);
    return { data: data as SupabaseSong[] };
  } catch (err) {
    console.error('Exception loading songs:', err);
    return { error: err };
  }
}

/**
 * Load public songs (visibility = 'public')
 */
export async function loadPublicSongs(
  limit = 50
): Promise<{ data?: SupabaseSong[]; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error loading public songs:', error);
      return { error };
    }

    console.log(`Loaded ${data?.length || 0} public songs`);
    return { data: data as SupabaseSong[] };
  } catch (err) {
    console.error('Exception loading public songs:', err);
    return { error: err };
  }
}

/**
 * Load all songs from Supabase (for moderators/admin)
 * Note: This requires moderator privileges via RLS policies
 */
export async function loadAllSongsAdmin(
  options: { limit?: number; offset?: number; search?: string } = {}
): Promise<{ data?: SupabaseSong[]; error?: unknown; count?: number }> {
  const { limit = 100, offset = 0, search = '' } = options;

  try {
    let queryBuilder = supabase
      .from('songs')
      .select('*', { count: 'exact' });

    if (search.trim()) {
      queryBuilder = queryBuilder.or(`title.ilike.%${search}%,artist.ilike.%${search}%`);
    }

    const { data, error, count } = await queryBuilder
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error loading all songs (admin):', error);
      return { error };
    }

    console.log(`[Admin] Loaded ${data?.length || 0} songs (total: ${count})`);
    return { data: data as SupabaseSong[], count: count ?? undefined };
  } catch (err) {
    console.error('Exception loading all songs (admin):', err);
    return { error: err };
  }
}

/**
 * Search public songs by title or artist
 */
export async function searchPublicSongs(
  query: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ data?: SupabaseSong[]; error?: unknown; count?: number }> {
  const { limit = 50, offset = 0 } = options;

  try {
    // Build query with OR filter for title and artist
    let queryBuilder = supabase
      .from('songs')
      .select('*', { count: 'exact' })
      .eq('visibility', 'public');

    if (query.trim()) {
      // Use ilike for case-insensitive search on title or artist
      queryBuilder = queryBuilder.or(`title.ilike.%${query}%,artist.ilike.%${query}%`);
    }

    const { data, error, count } = await queryBuilder
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error searching public songs:', error);
      return { error };
    }

    return { data: data as SupabaseSong[], count: count ?? undefined };
  } catch (err) {
    console.error('Exception searching public songs:', err);
    return { error: err };
  }
}

/**
 * Delete a song from Supabase
 */
export async function deleteSongFromSupabase(
  songId: string
): Promise<{ success?: boolean; error?: unknown }> {
  try {
    const { error } = await supabase
      .from('songs')
      .delete()
      .eq('id', songId);

    if (error) {
      console.error('Error deleting song from Supabase:', error);
      return { error };
    }

    console.log('Song deleted from Supabase');
    return { success: true };
  } catch (err) {
    console.error('Exception deleting song:', err);
    return { error: err };
  }
}

// ============================================================================
// Real-time Subscriptions (Supabase v2 Channel API)
// ============================================================================

export type SongChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface SongChangePayload {
  eventType: SongChangeEvent;
  new: SupabaseSong | null;
  old: { id: string } | null;
}

/**
 * Subscribe to real-time updates on user's songs
 * Uses Supabase v2 channel API
 */
export function subscribeToSongs(
  userId: string,
  callback: (payload: SongChangePayload) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`songs:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'songs',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        console.log('[Supabase] Real-time update received:', payload.eventType);
        callback({
          eventType: payload.eventType as SongChangeEvent,
          new: payload.new as SupabaseSong | null,
          old: payload.old as { id: string } | null,
        });
      }
    )
    .subscribe((status) => {
      console.log('[Supabase] Subscription status:', status);
    });

  return channel;
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}

// ============================================================================
// Sync Helpers
// ============================================================================

/**
 * Update song visibility
 */
export async function updateSongVisibility(
  songId: string,
  visibility: Visibility
): Promise<{ success?: boolean; error?: unknown }> {
  try {
    const { error } = await supabase
      .from('songs')
      .update({ visibility, updated_at: new Date().toISOString() })
      .eq('id', songId);

    if (error) {
      console.error('Error updating visibility:', error);
      return { error };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception updating visibility:', err);
    return { error: err };
  }
}

// ============================================================================
// Profile Management
// ============================================================================

/**
 * Get user profile from Supabase
 */
export async function getProfile(
  userId: string
): Promise<{ data?: SupabaseProfile; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      // Profile might not exist yet for older users
      if (error.code === 'PGRST116') {
        return { data: undefined };
      }
      console.error('Error getting profile:', error);
      return { error };
    }

    return { data: data as SupabaseProfile };
  } catch (err) {
    console.error('Exception getting profile:', err);
    return { error: err };
  }
}

/**
 * Update or create user profile
 */
export async function upsertProfile(
  userId: string,
  profile: Partial<Omit<SupabaseProfile, 'id' | 'created_at' | 'updated_at'>>
): Promise<{ data?: SupabaseProfile; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        ...profile,
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting profile:', error);
      return { error };
    }

    return { data: data as SupabaseProfile };
  } catch (err) {
    console.error('Exception upserting profile:', err);
    return { error: err };
  }
}

// ============================================================================
// User Management (Admin/Mod only)
// ============================================================================

/**
 * Load all user profiles (for moderators/admin)
 * Note: This requires moderator privileges via RLS policies
 */
export async function loadAllUsersAdmin(
  options: { limit?: number; offset?: number; search?: string } = {}
): Promise<{ data?: SupabaseProfile[]; error?: unknown; count?: number }> {
  const { limit = 50, offset = 0, search = '' } = options;

  try {
    let queryBuilder = supabase
      .from('profiles')
      .select('*', { count: 'exact' });

    if (search.trim()) {
      queryBuilder = queryBuilder.ilike('display_name', `%${search}%`);
    }

    const { data, error, count } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error loading all users (admin):', error);
      return { error };
    }

    console.log(`[Admin] Loaded ${data?.length || 0} users (total: ${count})`);
    return { data: data as SupabaseProfile[], count: count ?? undefined };
  } catch (err) {
    console.error('Exception loading all users (admin):', err);
    return { error: err };
  }
}

/**
 * Update a user's subscription tier (for moderators/admin)
 * Note: This requires moderator privileges via RLS policies
 */
export async function updateUserTierAdmin(
  userId: string,
  tier: SupabaseProfile['subscription_tier']
): Promise<{ success?: boolean; error?: unknown }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ subscription_tier: tier, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user tier:', error);
      return { error };
    }

    console.log(`[Admin] Updated user ${userId} tier to ${tier}`);
    return { success: true };
  } catch (err) {
    console.error('Exception updating user tier:', err);
    return { error: err };
  }
}

/**
 * Delete a user account (for moderators/admin)
 * This deletes the profile and all associated data (songs, collections, etc.)
 * Note: This requires moderator privileges via RLS policies
 */
export async function deleteUserAdmin(
  userId: string
): Promise<{ success?: boolean; error?: unknown }> {
  try {
    // Delete user's songs first
    const { error: songsError } = await supabase
      .from('songs')
      .delete()
      .eq('user_id', userId);

    if (songsError) {
      console.error('Error deleting user songs:', songsError);
      // Continue anyway - some tables might not have data
    }

    // Delete user's song sets/collections
    const { error: setsError } = await supabase
      .from('song_sets')
      .delete()
      .eq('user_id', userId);

    if (setsError) {
      console.error('Error deleting user song sets:', setsError);
    }

    // Delete user's custom instruments
    const { error: instrumentsError } = await supabase
      .from('custom_instruments')
      .delete()
      .eq('user_id', userId);

    if (instrumentsError) {
      console.error('Error deleting user instruments:', instrumentsError);
    }

    // Delete user's preferences
    const { error: prefsError } = await supabase
      .from('preferences')
      .delete()
      .eq('user_id', userId);

    if (prefsError) {
      console.error('Error deleting user preferences:', prefsError);
    }

    // Finally delete the profile
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Error deleting user profile:', profileError);
      return { error: profileError };
    }

    console.log(`[Admin] Deleted user ${userId} and all associated data`);
    return { success: true };
  } catch (err) {
    console.error('Exception deleting user:', err);
    return { error: err };
  }
}

/**
 * Upload avatar to Supabase Storage
 */
export async function uploadAvatar(
  userId: string,
  file: Blob
): Promise<{ url?: string; error?: unknown }> {
  try {
    const fileExt = file.type.split('/')[1] || 'png';
    const filePath = `${userId}/avatar.${fileExt}`;

    // Upload file (upsert to replace existing)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Error uploading avatar:', uploadError);
      return { error: uploadError };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return { url: publicUrl };
  } catch (err) {
    console.error('Exception uploading avatar:', err);
    return { error: err };
  }
}

// ============================================================================
// User Preferences Management
// ============================================================================

/**
 * Get user preferences from Supabase
 */
export async function getPreferences(
  userId: string
): Promise<{ data?: SupabasePreferences; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Preferences might not exist yet
      if (error.code === 'PGRST116') {
        return { data: undefined };
      }
      console.error('Error getting preferences:', error);
      return { error };
    }

    return { data: data as SupabasePreferences };
  } catch (err) {
    console.error('Exception getting preferences:', err);
    return { error: err };
  }
}

/**
 * Update or create user preferences
 */
export async function upsertPreferences(
  userId: string,
  prefs: Partial<Omit<SupabasePreferences, 'user_id' | 'created_at' | 'updated_at'>>
): Promise<{ data?: SupabasePreferences; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        ...prefs,
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting preferences:', error);
      return { error };
    }

    return { data: data as SupabasePreferences };
  } catch (err) {
    console.error('Exception upserting preferences:', err);
    return { error: err };
  }
}

// ============================================================================
// Custom Instruments Management
// ============================================================================

export interface SupabaseCustomInstrument {
  id: string;
  user_id: string;
  name: string;
  base_type: string;
  strings: string[];
  frets: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get all custom instruments for a user
 */
export async function getCustomInstruments(
  userId: string
): Promise<{ data?: SupabaseCustomInstrument[]; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('custom_instruments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error getting custom instruments:', error);
      return { error };
    }

    return { data: data as SupabaseCustomInstrument[] };
  } catch (err) {
    console.error('Exception getting custom instruments:', err);
    return { error: err };
  }
}

/**
 * Upsert a custom instrument
 */
export async function upsertCustomInstrument(
  userId: string,
  instrument: {
    id: string;
    name: string;
    baseType: string;
    strings: string[];
    frets: number;
    isPublic: boolean;
  }
): Promise<{ data?: SupabaseCustomInstrument; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('custom_instruments')
      .upsert({
        id: instrument.id,
        user_id: userId,
        name: instrument.name,
        base_type: instrument.baseType,
        strings: instrument.strings,
        frets: instrument.frets,
        is_public: instrument.isPublic,
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting custom instrument:', error);
      return { error };
    }

    return { data: data as SupabaseCustomInstrument };
  } catch (err) {
    console.error('Exception upserting custom instrument:', err);
    return { error: err };
  }
}

/**
 * Delete a custom instrument
 */
export async function deleteCustomInstrument(
  instrumentId: string
): Promise<{ success?: boolean; error?: unknown }> {
  try {
    const { error } = await supabase
      .from('custom_instruments')
      .delete()
      .eq('id', instrumentId);

    if (error) {
      console.error('Error deleting custom instrument:', error);
      return { error };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception deleting custom instrument:', err);
    return { error: err };
  }
}

/**
 * Load all custom instruments (for moderators/admin)
 * Note: This requires moderator privileges via RLS policies
 */
export async function loadAllInstrumentsAdmin(
  options: { limit?: number; offset?: number; search?: string } = {}
): Promise<{ data?: SupabaseCustomInstrument[]; error?: unknown; count?: number }> {
  const { limit = 100, offset = 0, search = '' } = options;

  try {
    let queryBuilder = supabase
      .from('custom_instruments')
      .select('*', { count: 'exact' });

    if (search.trim()) {
      queryBuilder = queryBuilder.ilike('name', `%${search}%`);
    }

    const { data, error, count } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error loading all instruments (admin):', error);
      return { error };
    }

    console.log(`[Admin] Loaded ${data?.length || 0} instruments (total: ${count})`);
    return { data: data as SupabaseCustomInstrument[], count: count ?? undefined };
  } catch (err) {
    console.error('Exception loading all instruments (admin):', err);
    return { error: err };
  }
}

// ============================================================================
// Song Sets / Collections Management
// ============================================================================

export interface SupabaseSongSet {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  parent_set_id: string | null;
  song_ids: string[];
  is_setlist: boolean;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

export interface SupabaseSystemChord {
  id: string;
  chord_name: string;
  instrument_id: string;
  positions: number[];
  fingers: number[] | null;
  barres: any | null; // JSONB in Postgres
  base_fret: number;
  created_by: string;
  created_by_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Search public song sets/collections
 */
export async function searchPublicSongSets(
  query: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ data?: SupabaseSongSet[]; error?: unknown; count?: number }> {
  const { limit = 50, offset = 0 } = options;

  try {
    let queryBuilder = supabase
      .from('song_sets')
      .select('*', { count: 'exact' })
      .eq('visibility', 'public');

    if (query.trim()) {
      queryBuilder = queryBuilder.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
    }

    const { data, error, count } = await queryBuilder
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error searching public song sets:', error);
      return { error };
    }

    return { data: data as SupabaseSongSet[], count: count ?? undefined };
  } catch (err) {
    console.error('Exception searching public song sets:', err);
    return { error: err };
  }
}

/**
 * Get a public song set by ID with its songs
 */
export async function getPublicSongSet(
  setId: string
): Promise<{ data?: SupabaseSongSet & { songs: SupabaseSong[] }; error?: unknown }> {
  try {
    // Get the song set
    const { data: set, error: setError } = await supabase
      .from('song_sets')
      .select('*')
      .eq('id', setId)
      .eq('visibility', 'public')
      .single();

    if (setError) {
      console.error('Error getting public song set:', setError);
      return { error: setError };
    }

    // Get the songs in this set
    const songIds = (set as SupabaseSongSet).song_ids;
    if (!songIds || songIds.length === 0) {
      return { data: { ...(set as SupabaseSongSet), songs: [] } };
    }

    const { data: songs, error: songsError } = await supabase
      .from('songs')
      .select('*')
      .in('id', songIds);

    if (songsError) {
      console.error('Error getting songs for set:', songsError);
      return { error: songsError };
    }

    return { data: { ...(set as SupabaseSongSet), songs: (songs as SupabaseSong[]) ?? [] } };
  } catch (err) {
    console.error('Exception getting public song set:', err);
    return { error: err };
  }
}

/**
 * Save a song set to Supabase
 */
export async function saveSongSetToSupabase(
  userId: string,
  set: {
    id: string;
    name: string;
    description?: string;
    parentSetId?: string;
    songIds: string[];
    isSetlist: boolean;
    visibility: Visibility;
  }
): Promise<{ data?: SupabaseSongSet; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('song_sets')
      .upsert({
        id: set.id,
        user_id: userId,
        name: set.name,
        description: set.description ?? null,
        parent_set_id: set.parentSetId ?? null,
        song_ids: set.songIds,
        is_setlist: set.isSetlist,
        visibility: set.visibility,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving song set to Supabase:', error);
      return { error };
    }

    return { data: data as SupabaseSongSet };
  } catch (err) {
    console.error('Exception saving song set:', err);
    return { error: err };
  }
}

/**
 * Load all song sets for a user from Supabase
 */
export async function loadSongSetsFromSupabase(
  userId: string
): Promise<{ data?: SupabaseSongSet[]; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('song_sets')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading song sets from Supabase:', error);
      return { error };
    }

    return { data: data as SupabaseSongSet[] };
  } catch (err) {
    console.error('Exception loading song sets:', err);
    return { error: err };
  }
}

/**
 * Delete a song set from Supabase
 */
export async function deleteSongSetFromSupabase(
  setId: string
): Promise<{ success?: boolean; error?: unknown }> {
  try {
    const { error } = await supabase
      .from('song_sets')
      .delete()
      .eq('id', setId);

    if (error) {
      console.error('Error deleting song set from Supabase:', error);
      return { error };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception deleting song set:', err);
    return { error: err };
  }
}

// ============================================================================
// System Chords (Moderator-created overrides)
// ============================================================================

/**
 * Load all system chords (cached locally for performance)
 */
export async function loadSystemChords(): Promise<{
  data?: SupabaseSystemChord[];
  error?: unknown;
}> {
  try {
    const { data, error } = await supabase
      .from('system_chords')
      .select('*')
      .order('chord_name', { ascending: true });

    if (error) {
      console.error('Error loading system chords:', error);
      return { error };
    }

    console.log(`Loaded ${data?.length || 0} system chords`);
    return { data: data as SupabaseSystemChord[] };
  } catch (err) {
    console.error('Exception loading system chords:', err);
    return { error: err };
  }
}

/**
 * Get system chords for a specific instrument
 */
export async function getSystemChordsForInstrument(
  instrumentId: string
): Promise<{ data?: SupabaseSystemChord[]; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('system_chords')
      .select('*')
      .eq('instrument_id', instrumentId)
      .order('chord_name', { ascending: true });

    if (error) {
      console.error('Error loading system chords for instrument:', error);
      return { error };
    }

    return { data: data as SupabaseSystemChord[] };
  } catch (err) {
    console.error('Exception loading system chords for instrument:', err);
    return { error: err };
  }
}

/**
 * Get a specific system chord
 */
export async function getSystemChord(
  chordName: string,
  instrumentId: string
): Promise<{ data?: SupabaseSystemChord; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('system_chords')
      .select('*')
      .eq('chord_name', chordName)
      .eq('instrument_id', instrumentId)
      .single();

    if (error) {
      // Not found is not an error for our purposes
      if (error.code === 'PGRST116') {
        return { data: undefined };
      }
      console.error('Error loading system chord:', error);
      return { error };
    }

    return { data: data as SupabaseSystemChord };
  } catch (err) {
    console.error('Exception loading system chord:', err);
    return { error: err };
  }
}

/**
 * Save or update a system chord (moderators only)
 */
export async function upsertSystemChord(
  chord: {
    id?: string;
    chordName: string;
    instrumentId: string;
    positions: number[];
    fingers?: number[];
    barres?: any;
    baseFret: number;
    description?: string;
  },
  creatorId: string,
  creatorName: string
): Promise<{ data?: SupabaseSystemChord; error?: unknown }> {
  try {
    const payload: any = {
      chord_name: chord.chordName,
      instrument_id: chord.instrumentId,
      positions: chord.positions,
      fingers: chord.fingers ?? null,
      barres: chord.barres ?? null,
      base_fret: chord.baseFret,
      created_by: creatorId,
      created_by_name: creatorName,
      description: chord.description ?? null,
      updated_at: new Date().toISOString(),
    };

    if (chord.id) {
      payload.id = chord.id;
    }

    const { data, error } = await supabase
      .from('system_chords')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error upserting system chord:', error);
      return { error };
    }

    return { data: data as SupabaseSystemChord };
  } catch (err) {
    console.error('Exception upserting system chord:', err);
    return { error: err };
  }
}

/**
 * Delete a system chord (moderators only)
 */
export async function deleteSystemChord(
  id: string
): Promise<{ success?: boolean; error?: unknown }> {
  try {
    const { error } = await supabase.from('system_chords').delete().eq('id', id);

    if (error) {
      console.error('Error deleting system chord:', error);
      return { error };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception deleting system chord:', err);
    return { error: err };
  }
}

// ============================================================================
// Saved Songs (Song Lineage Tracking)
// ============================================================================

/**
 * Saved song reference - tracks relationship between original public songs
 * and user's saved copies. Enables "View Original" and prevents duplicate saves.
 */
export interface SupabaseSavedSong {
  id: string;
  user_id: string;
  source_id: string;
  saved_song_id: string;
  saved_at: string;
}

/**
 * Load all saved song references for a user
 */
export async function loadSavedSongReferences(
  userId: string
): Promise<{ data?: SupabaseSavedSong[]; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('saved_songs')
      .select('*')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });

    if (error) {
      console.error('Error loading saved song references:', error);
      return { error };
    }

    console.log(`Loaded ${data?.length || 0} saved song references`);
    return { data: data as SupabaseSavedSong[] };
  } catch (err) {
    console.error('Exception loading saved song references:', err);
    return { error: err };
  }
}

/**
 * Get a saved song reference by user and source (original song ID)
 * Used to check if a user has already saved a specific public song
 */
export async function getSavedSongBySource(
  userId: string,
  sourceId: string
): Promise<{ data?: SupabaseSavedSong; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('saved_songs')
      .select('*')
      .eq('user_id', userId)
      .eq('source_id', sourceId)
      .single();

    if (error) {
      // Not found is not an error for our purposes
      if (error.code === 'PGRST116') {
        return { data: undefined };
      }
      console.error('Error getting saved song reference:', error);
      return { error };
    }

    return { data: data as SupabaseSavedSong };
  } catch (err) {
    console.error('Exception getting saved song reference:', err);
    return { error: err };
  }
}

/**
 * Create a saved song reference
 * Called when a user saves a public song to their library
 */
export async function saveSavedSongReference(
  userId: string,
  sourceId: string,
  savedSongId: string
): Promise<{ data?: SupabaseSavedSong; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('saved_songs')
      .insert({
        user_id: userId,
        source_id: sourceId,
        saved_song_id: savedSongId,
        saved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving saved song reference:', error);
      return { error };
    }

    console.log(`Created saved song reference: ${sourceId} -> ${savedSongId}`);
    return { data: data as SupabaseSavedSong };
  } catch (err) {
    console.error('Exception saving saved song reference:', err);
    return { error: err };
  }
}

/**
 * Delete a saved song reference
 * Called when a user removes a saved song from their library
 */
export async function deleteSavedSongReference(
  userId: string,
  sourceId: string
): Promise<{ success?: boolean; error?: unknown }> {
  try {
    const { error } = await supabase
      .from('saved_songs')
      .delete()
      .eq('user_id', userId)
      .eq('source_id', sourceId);

    if (error) {
      console.error('Error deleting saved song reference:', error);
      return { error };
    }

    console.log(`Deleted saved song reference for source: ${sourceId}`);
    return { success: true };
  } catch (err) {
    console.error('Exception deleting saved song reference:', err);
    return { error: err };
  }
}

/**
 * Get a public song by ID (for "View Original" feature)
 * Returns the original song if it still exists and is public
 */
export async function getPublicSongById(
  songId: string
): Promise<{ data?: SupabaseSong; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('id', songId)
      .eq('visibility', 'public')
      .single();

    if (error) {
      // Not found is not an error - original may have been deleted
      if (error.code === 'PGRST116') {
        return { data: undefined };
      }
      console.error('Error getting public song by ID:', error);
      return { error };
    }

    return { data: data as SupabaseSong };
  } catch (err) {
    console.error('Exception getting public song by ID:', err);
    return { error: err };
  }
}
