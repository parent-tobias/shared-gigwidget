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
    const { data, error } = await supabase
      .from('songs')
      .upsert(toSupabaseSong(userId, song, content), {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving song to Supabase:', error);
      return { error };
    }

    console.log('Song saved to Supabase:', data);
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
