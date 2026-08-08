import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabaseAdmin } from '$lib/server/supabase-admin';
import { hashApiKey } from '$lib/api-keys';

interface CreateSongInput {
  title: string;
  artist?: string;
  key?: string;
  tempo?: number;
  time_signature?: [number, number];
  tags?: string[];
  content?: string;
  visibility?: 'private' | 'space' | 'public';
}

const ALLOWED_VISIBILITY = ['private', 'space', 'public'] as const;

export const POST: RequestHandler = async ({ request }) => {
  // --- Auth ---
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization: Bearer header' }, { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return json({ error: 'Empty bearer token' }, { status: 401 });
  }

  const keyHash = await hashApiKey(token);
  const admin = getSupabaseAdmin();

  const { data: apiKey, error: keyErr } = await admin
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (keyErr) {
    console.error('[api/v1/songs] api_keys lookup failed:', keyErr);
    return json({ error: 'Internal error' }, { status: 500 });
  }
  if (!apiKey) {
    return json({ error: 'Invalid API key' }, { status: 401 });
  }
  if (apiKey.revoked_at) {
    return json({ error: 'API key has been revoked' }, { status: 401 });
  }

  // --- Body ---
  let body: CreateSongInput;
  try {
    body = (await request.json()) as CreateSongInput;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return json({ error: 'title is required and must be a non-empty string' }, { status: 400 });
  }
  if (title.length > 500) {
    return json({ error: 'title must be 500 characters or fewer' }, { status: 400 });
  }

  const visibility = body.visibility ?? 'private';
  if (!ALLOWED_VISIBILITY.includes(visibility)) {
    return json(
      { error: `visibility must be one of: ${ALLOWED_VISIBILITY.join(', ')}` },
      { status: 400 }
    );
  }

  // --- Insert ---
  const insertPayload: Record<string, unknown> = {
    user_id: apiKey.user_id,
    title,
    visibility,
  };
  if (typeof body.artist === 'string') insertPayload.artist = body.artist;
  if (typeof body.key === 'string') insertPayload.key = body.key;
  if (typeof body.tempo === 'number' && Number.isFinite(body.tempo) && body.tempo > 0) {
    insertPayload.tempo = Math.round(body.tempo);
  }
  if (
    Array.isArray(body.time_signature) &&
    body.time_signature.length === 2 &&
    body.time_signature.every((n) => Number.isInteger(n) && n > 0)
  ) {
    insertPayload.time_signature = body.time_signature;
  }
  if (Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string')) {
    insertPayload.tags = body.tags;
  }
  if (typeof body.content === 'string') insertPayload.content = body.content;

  const { data: song, error: insertErr } = await admin
    .from('songs')
    .insert(insertPayload)
    .select()
    .single();

  if (insertErr) {
    console.error('[api/v1/songs] song insert failed:', insertErr);
    return json({ error: 'Failed to create song' }, { status: 500 });
  }

  // Best-effort last_used_at bump. Await so we don't lose it to lambda teardown,
  // but don't fail the request if the update itself errors.
  const { error: usedErr } = await admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id);
  if (usedErr) {
    console.error('[api/v1/songs] last_used_at update failed:', usedErr);
  }

  return json({ song }, { status: 201 });
};
