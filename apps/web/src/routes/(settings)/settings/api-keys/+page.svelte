<script lang="ts">
  import { browser } from '$app/environment';
  import { isAuthenticated, getSupabaseUserId } from '$lib/stores/authStore.svelte';
  import { supabase } from '$lib/stores/supabaseStore';
  import { generateApiKey } from '$lib/api-keys';
  import type { ApiKeyRow } from '$lib/models/apiKey';

  let keys = $state<ApiKeyRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Generate modal state
  let showGenerateModal = $state(false);
  let newLabel = $state('');
  let generating = $state(false);

  // Reveal-once state (populated after successful generation)
  let revealedPlaintext = $state<string | null>(null);
  let copied = $state(false);

  $effect(() => {
    if (!browser) return;
    loadKeys();
  });

  async function loadKeys() {
    loading = true;
    error = null;
    if (!isAuthenticated()) {
      loading = false;
      return;
    }
    const userId = getSupabaseUserId();
    if (!userId) {
      loading = false;
      return;
    }
    const { data, error: err } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (err) {
      error = err.message;
    } else {
      keys = (data ?? []) as ApiKeyRow[];
    }
    loading = false;
  }

  function openGenerate() {
    newLabel = '';
    revealedPlaintext = null;
    copied = false;
    showGenerateModal = true;
  }

  function closeGenerate() {
    showGenerateModal = false;
    // Refresh list so the newly-created key appears
    if (revealedPlaintext) loadKeys();
    revealedPlaintext = null;
    copied = false;
  }

  async function submitGenerate() {
    const label = newLabel.trim();
    if (!label) {
      error = 'Please enter a label.';
      return;
    }
    const userId = getSupabaseUserId();
    if (!userId) {
      error = 'You must be signed in to generate an API key.';
      return;
    }
    generating = true;
    error = null;
    try {
      const key = await generateApiKey();
      const { error: err } = await supabase.from('api_keys').insert({
        user_id: userId,
        key_hash: key.keyHash,
        key_prefix: key.keyPrefix,
        label,
      });
      if (err) {
        error = err.message;
        return;
      }
      revealedPlaintext = key.plaintext;
    } finally {
      generating = false;
    }
  }

  async function copyPlaintext() {
    if (!revealedPlaintext) return;
    try {
      await navigator.clipboard.writeText(revealedPlaintext);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      error = 'Copy failed. Select the text and copy manually.';
    }
  }

  async function revoke(key: ApiKeyRow) {
    if (!confirm(`Revoke "${key.label}"? Any client using this key will stop working immediately.`)) return;
    const { error: err } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', key.id);
    if (err) {
      error = err.message;
      return;
    }
    await loadKeys();
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<div class="page">
  <header>
    <h1>API Keys</h1>
    <p class="lead">
      Personal access tokens for the HTTP API and MCP integrations. Use these to let external tools
      (like Claude Code) create songs in your library on your behalf.
    </p>
  </header>

  {#if !isAuthenticated()}
    <p class="empty">Sign in from the Account page to manage API keys.</p>
  {:else}
    <div class="toolbar">
      <button class="primary" onclick={openGenerate}>Generate new key</button>
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    {#if loading}
      <p>Loading…</p>
    {:else if keys.length === 0}
      <p class="empty">
        No keys yet. Generate one to connect Claude Code or another external client.
      </p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Prefix</th>
            <th>Created</th>
            <th>Last used</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each keys as key (key.id)}
            <tr class:revoked={key.revoked_at}>
              <td>{key.label}</td>
              <td><code>{key.key_prefix}…</code></td>
              <td>{fmtDate(key.created_at)}</td>
              <td>{fmtDate(key.last_used_at)}</td>
              <td class="actions">
                {#if key.revoked_at}
                  <span class="tag">Revoked {fmtDate(key.revoked_at)}</span>
                {:else}
                  <button class="danger" onclick={() => revoke(key)}>Revoke</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</div>

{#if showGenerateModal}
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Generate API key"
    tabindex="-1"
    onclick={closeGenerate}
    onkeydown={(e) => e.key === 'Escape' && closeGenerate()}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal" role="document" onclick={(e) => e.stopPropagation()}>
      {#if !revealedPlaintext}
        <h2>Generate API key</h2>
        <p class="modal-help">
          Give this key a descriptive label so you can identify it later.
        </p>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            submitGenerate();
          }}
        >
          <label>
            Label
            <input
              type="text"
              bind:value={newLabel}
              placeholder="e.g. Claude MCP on laptop"
              maxlength="100"
              autofocus
              disabled={generating}
            />
          </label>
          <div class="modal-actions">
            <button type="button" class="secondary" onclick={closeGenerate} disabled={generating}>
              Cancel
            </button>
            <button type="submit" class="primary" disabled={generating || !newLabel.trim()}>
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </form>
      {:else}
        <h2>Save your API key</h2>
        <p class="modal-help warning">
          This is the only time you'll see this key. Copy it now and store it somewhere safe
          (a password manager). If you lose it, revoke this key and generate a new one.
        </p>
        <div class="plaintext-box">
          <code>{revealedPlaintext}</code>
          <button type="button" class="secondary" onclick={copyPlaintext}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div class="modal-actions">
          <button type="button" class="primary" onclick={closeGenerate}>
            I've saved it
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page {
    max-width: 900px;
  }

  header {
    margin-bottom: var(--spacing-lg);
  }

  header h1 {
    margin: 0 0 var(--spacing-sm);
  }

  .lead {
    color: var(--color-text-muted);
    margin: 0;
  }

  .toolbar {
    margin-bottom: var(--spacing-md);
  }

  .empty {
    color: var(--color-text-muted);
    background: var(--color-bg-secondary);
    padding: var(--spacing-lg);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .error {
    color: var(--color-danger, #e94560);
    background: color-mix(in srgb, var(--color-danger, #e94560) 10%, transparent);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-md);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  th, td {
    text-align: left;
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  th {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr.revoked td {
    color: var(--color-text-muted);
    background: color-mix(in srgb, var(--color-bg) 40%, transparent);
  }

  code {
    font-family: var(--font-mono, Consolas, Monaco, monospace);
    font-size: 0.9em;
  }

  .actions {
    text-align: right;
  }

  .tag {
    font-size: 0.8rem;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text-muted);
  }

  button.primary,
  button.secondary,
  button.danger {
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
  }

  button.primary {
    background: var(--color-primary);
    color: white;
  }

  button.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button.secondary {
    background: var(--color-bg);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  button.danger {
    background: var(--color-danger, #e94560);
    color: white;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--color-bg);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    max-width: 520px;
    width: 90%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .modal h2 {
    margin: 0 0 var(--spacing-sm);
  }

  .modal-help {
    color: var(--color-text-muted);
    margin: 0 0 var(--spacing-md);
    font-size: 0.9rem;
  }

  .modal-help.warning {
    color: var(--color-danger, #e94560);
  }

  .modal form label {
    display: block;
    font-size: 0.9rem;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-md);
  }

  .modal form input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    margin-top: 4px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary);
    color: var(--color-text);
    font-size: 0.95rem;
  }

  .plaintext-box {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    background: var(--color-bg-secondary);
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-md);
    border: 1px solid var(--color-border);
  }

  .plaintext-box code {
    flex: 1;
    word-break: break-all;
    font-size: 0.85rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
  }
</style>
