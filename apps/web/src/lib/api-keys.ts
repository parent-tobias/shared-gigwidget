/**
 * API key generation and hashing.
 *
 * Uses the Web Crypto API (available in modern browsers and Node 20+), so
 * these helpers work identically in the settings UI (browser) and in the
 * API route handler (Vercel Node runtime). The plaintext key produced by
 * generateApiKey() must be shown to the user exactly once and never stored.
 */

const KEY_PREFIX = 'gw_live_';
const RANDOM_BYTES = 32; // 256 bits of entropy
const DISPLAY_PREFIX_LENGTH = 12; // e.g. "gw_live_a1b2" for the settings UI

export interface GeneratedApiKey {
  /** Plaintext key to show the user exactly once. Never store this. */
  plaintext: string;
  /** SHA-256 hex hash of the plaintext. Store in the api_keys.key_hash column. */
  keyHash: string;
  /** First 12 chars of the plaintext. Store in the api_keys.key_prefix column. */
  keyPrefix: string;
}

export async function generateApiKey(): Promise<GeneratedApiKey> {
  const random = new Uint8Array(RANDOM_BYTES);
  crypto.getRandomValues(random);
  const plaintext = KEY_PREFIX + base64urlEncode(random);
  return {
    plaintext,
    keyHash: await hashApiKey(plaintext),
    keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

/**
 * SHA-256 hex hash of a plaintext key. Deterministic (no salt) — safe because
 * keys are 256-bit random secrets, not user-chosen passwords. Lets the API
 * route look up a bearer token in the api_keys table with a single indexed query.
 */
export async function hashApiKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

function base64urlEncode(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
