import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

let _admin: SupabaseClient | null = null;

/**
 * Supabase client authenticated with the service role key.
 * BYPASSES ROW LEVEL SECURITY — use only in server code (API routes, hooks,
 * actions). SvelteKit's $env/static/private plus this file's location under
 * lib/server/ prevent it from being imported into client bundles.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _admin;
}
