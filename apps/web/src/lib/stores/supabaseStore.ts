import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Song, Visibility } from '@gigwidget/core';

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
