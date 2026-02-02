<script lang="ts">
  import { browser } from '$app/environment';
  import { hasPermission } from '@gigwidget/core';
  import type { SupabaseSystemChord } from '$lib/stores/supabaseStore';
  import { upsertSystemChord, deleteSystemChord } from '$lib/stores/supabaseStore';
  import { clearSystemChordCacheForChord } from '$lib/services/chordResolution';

  interface Props {
    chordName: string;
    instrumentId: string;
    existingSystemChord?: SupabaseSystemChord;
    onSave?: () => void;
    onCancel?: () => void;
  }

  let { chordName, instrumentId, existingSystemChord, onSave, onCancel }: Props = $props();

  // Permission check
  let user = $state<any>(null);
  let canCreateSystemChords = $derived(user && hasPermission(user, 'create_system_chords'));

  // Form state
  let positions = $state<number[]>(existingSystemChord?.positions ?? [0, 0, 0, 0]);
  let fingers = $state<number[]>(existingSystemChord?.fingers ?? []);
  let baseFret = $state(existingSystemChord?.base_fret ?? 1);
  let description = $state(existingSystemChord?.description ?? '');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let componentReady = $state(false);

  $effect(() => {
    if (browser) {
      loadUser();
      loadChordComponent();
    }
  });

  async function loadUser() {
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const users = await db.users.toArray();
      if (users.length > 0) {
        user = users[0];
      }
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  }

  async function loadChordComponent() {
    try {
      await import('@parent-tobias/chord-component');
      componentReady = true;
    } catch (err) {
      console.error('Failed to load chord-component:', err);
    }
  }

  async function saveSystemChord() {
    if (!canCreateSystemChords || !user) {
      error = 'You do not have permission to create system chords';
      return;
    }

    if (positions.length === 0) {
      error = 'Please add at least one fret position';
      return;
    }

    saving = true;
    error = null;

    try {
      const { error: saveError } = await upsertSystemChord(
        {
          id: existingSystemChord?.id,
          chordName,
          instrumentId,
          positions,
          fingers: fingers.length > 0 ? fingers : undefined,
          barres: undefined, // TODO: Add barres support
          baseFret,
          description: description || undefined,
        },
        user.displayName
      );

      if (saveError) {
        error = 'Failed to save system chord';
        console.error(saveError);
        return;
      }

      // Clear cache for this chord
      clearSystemChordCacheForChord(instrumentId, chordName);

      onSave?.();
    } catch (err) {
      console.error('Exception saving system chord:', err);
      error = 'Failed to save system chord';
    } finally {
      saving = false;
    }
  }

  async function deleteChord() {
    if (!existingSystemChord?.id) return;

    if (!confirm('Delete this system chord? This action cannot be undone.')) {
      return;
    }

    saving = true;
    error = null;

    try {
      const { error: deleteError } = await deleteSystemChord(existingSystemChord.id);

      if (deleteError) {
        error = 'Failed to delete system chord';
        console.error(deleteError);
        return;
      }

      // Clear cache for this chord
      clearSystemChordCacheForChord(instrumentId, chordName);

      onSave?.();
    } catch (err) {
      console.error('Exception deleting system chord:', err);
      error = 'Failed to delete system chord';
    } finally {
      saving = false;
    }
  }

  function updatePosition(index: number, value: number) {
    const newPositions = [...positions];
    newPositions[index] = value;
    positions = newPositions;
  }

  function addString() {
    positions = [...positions, 0];
    if (fingers.length > 0) {
      fingers = [...fingers, 0];
    }
  }

  function removeString(index: number) {
    positions = positions.filter((_, i) => i !== index);
    if (fingers.length > 0) {
      fingers = fingers.filter((_, i) => i !== index);
    }
  }

  function formatPositions(pos: number[]): string {
    return pos.map((p) => (p === -1 ? 'x' : p === 0 ? '0' : p.toString())).join(' ');
  }
</script>

{#if !canCreateSystemChords}
  <div class="permission-error">
    <h3>Access Denied</h3>
    <p>You do not have permission to create system chords.</p>
    <p>This feature is only available to moderators.</p>
  </div>
{:else}
  <div class="system-chord-editor">
    <div class="editor-header">
      <h3>System Chord: {chordName}</h3>
      <span class="mod-badge">Moderator</span>
    </div>

    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    <div class="editor-content">
      <div class="preview-section">
        <h4>Preview</h4>
        {#if componentReady && positions.length > 0}
          <chord-diagram
            chord={JSON.stringify({
              positions,
              fingers: fingers.length > 0 ? fingers : undefined,
              baseFret,
            })}
            size="large"
          ></chord-diagram>
        {:else}
          <div class="positions-text">{formatPositions(positions)}</div>
        {/if}
      </div>

      <div class="controls-section">
        <div class="form-group">
          <label for="instrument">Instrument</label>
          <input type="text" id="instrument" value={instrumentId} disabled />
        </div>

        <div class="form-group">
          <label for="baseFret">Base Fret</label>
          <input
            type="number"
            id="baseFret"
            bind:value={baseFret}
            min="1"
            max="20"
            disabled={saving}
          />
        </div>

        <div class="form-group">
          <label for="description">Description (optional)</label>
          <textarea
            id="description"
            bind:value={description}
            placeholder="Describe this chord variation (e.g., 'Easy beginner version')"
            rows="3"
            disabled={saving}
          ></textarea>
        </div>

        <div class="form-group">
          <label>Fret Positions</label>
          <div class="positions-controls">
            {#each positions as position, index (index)}
              <div class="position-row">
                <span class="string-label">String {index + 1}:</span>
                <input
                  type="number"
                  value={position}
                  onchange={(e) => updatePosition(index, parseInt(e.currentTarget.value) || 0)}
                  min="-1"
                  max="24"
                  disabled={saving}
                  placeholder="0"
                />
                <button
                  type="button"
                  class="btn-icon"
                  onclick={() => removeString(index)}
                  disabled={saving || positions.length <= 1}
                  title="Remove string"
                >
                  ×
                </button>
              </div>
            {/each}
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick={addString} disabled={saving}>
            + Add String
          </button>
          <p class="help-text">Use -1 for muted strings, 0 for open strings</p>
        </div>
      </div>
    </div>

    <div class="editor-actions">
      {#if existingSystemChord}
        <button type="button" class="btn btn-danger" onclick={deleteChord} disabled={saving}>
          Delete
        </button>
      {/if}

      {#if onCancel}
        <button type="button" class="btn btn-secondary" onclick={onCancel} disabled={saving}>
          Cancel
        </button>
      {/if}

      <button type="button" class="btn btn-primary" onclick={saveSystemChord} disabled={saving}>
        {saving ? 'Saving...' : 'Save System Chord'}
      </button>
    </div>
  </div>
{/if}

<style>
  .permission-error {
    padding: var(--spacing-lg);
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .permission-error h3 {
    margin: 0 0 var(--spacing-sm) 0;
    color: var(--color-primary);
  }

  .system-chord-editor {
    background-color: var(--color-bg-secondary);
    border: 2px solid #4CAF50;
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
    padding-bottom: var(--spacing-sm);
    border-bottom: 1px solid var(--color-border);
  }

  .editor-header h3 {
    margin: 0;
    font-size: 1.25rem;
  }

  .mod-badge {
    background-color: #4CAF50;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
    color: var(--color-primary);
  }

  .editor-content {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
  }

  @media (max-width: 768px) {
    .editor-content {
      grid-template-columns: 1fr;
    }
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .preview-section h4 {
    margin: 0 0 var(--spacing-sm) 0;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .positions-text {
    font-family: monospace;
    font-size: 1rem;
    padding: var(--spacing-md);
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
  }

  .controls-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .form-group label {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .form-group input[type='text'],
  .form-group input[type='number'],
  .form-group textarea {
    width: 100%;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    font-family: inherit;
  }

  .form-group textarea {
    resize: vertical;
  }

  .positions-controls {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .position-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .string-label {
    min-width: 70px;
    font-size: 0.875rem;
  }

  .position-row input {
    flex: 1;
    max-width: 100px;
  }

  .btn-icon {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-icon:hover:not(:disabled) {
    color: var(--color-primary);
  }

  .btn-icon:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .help-text {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
  }

  .editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--color-border);
  }

  .btn-danger {
    background-color: #f44336;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background-color: #d32f2f;
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.875rem;
  }

  chord-diagram {
    display: block;
    width: 150px;
    height: 180px;
  }
</style>
