/**
 * Shape of a row in the `api_keys` Supabase table.
 *
 * Client-safe: contains no plaintext key material (key_hash is a hash, not
 * the plaintext). The settings UI imports this to type its list rendering.
 */
export interface ApiKeyRow {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}
