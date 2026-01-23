import { createClient } from '@supabase/supabase-js';
import { dev } from '$app/environment';

const supabaseUrl = dev ? 
  'https://toftoeuhrikfzfwczlyf.supabase.co' :
  import.meta.env.PUBLIC_SUPABASE_URL;

const supabaseAnonKey = dev ?
  'sb_publishable_RsTIpcpqTLV2kEzjRYYWAA_DFXpVS7M' :
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Save a song to Supabase
 */
export async function saveSongToSupabase(userId: string, song: any) {
  try {
    const { data, error } = await supabase
      .from('songs')
      .upsert({
        id: song.id,
        user_id: userId,
        title: song.title,
        artist: song.artist,
        content: song.content,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id'
      });

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
export async function loadSongsFromSupabase(userId: string) {
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
    return { data };
  } catch (err) {
    console.error('Exception loading songs:', err);
    return { error: err };
  }
}

/**
 * Delete a song from Supabase
 */
export async function deleteSongFromSupabase(songId: string) {
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

/**
 * Subscribe to real-time updates on songs
 */
export function subscribeToSongs(userId: string, callback: (payload: any) => void) {
  const subscription = supabase
    .from(`songs:user_id=eq.${userId}`)
    .on('*', (payload) => {
      console.log('Real-time update received:', payload);
      callback(payload);
    })
    .subscribe();

  return subscription;
}
