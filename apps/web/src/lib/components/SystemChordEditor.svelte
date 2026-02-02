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

  // Form state - provide default structure for new chords
  let chordData = $state<any>(
    existingSystemChord
      ? {
          positions: existingSystemChord.positions,
          fingers: existingSystemChord.fingers,
          barres: existingSystemChord.barres,
          baseFret: existingSystemChord.base_fret,
        }
      : {
          positions: [],
          fingers: [],
          barres: [],
          baseFret: 1,
        }
  );
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
      // Check if custom elements are already defined
      if (customElements.get('chord-editor')) {
        componentReady = true;
        return;
      }

      await import('@parent-tobias/chord-component');
      componentReady = true;
    } catch (err) {
      console.error('Failed to load chord-component:', err);
      // If error is about already defined, component is still ready
      if (err instanceof DOMException && err.message.includes('already been defined')) {
        componentReady = true;
      }
    }
  }

  async function saveSystemChord() {
    if (!canCreateSystemChords || !user) {
      error = 'You do not have permission to create system chords';
      return;
    }

    saving = true;
    error = null;

    try {
      const { indexedDBService } = await import('@parent-tobias/chord-component');

      // Retrieve current chord data from chord-component's IndexedDB
      const currentChord = await indexedDBService.getUserChord(user.id, chordName, instrumentId);

      if (!currentChord || !currentChord.positions || currentChord.positions.length === 0) {
        error = 'No chord data to save. Please create a chord first.';
        saving = false;
        return;
      }

      const { error: saveError } = await upsertSystemChord(
        {
          id: existingSystemChord?.id,
          chordName,
          instrumentId,
          positions: [...currentChord.positions],
          fingers: currentChord.fingers ? [...currentChord.fingers] : undefined,
          barres: currentChord.barres ? currentChord.barres.map((b: any) => ({ ...b })) : undefined,
          baseFret: currentChord.baseFret || 1,
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
      {#if componentReady}
        <chord-editor
          chord-name={chordName}
          instrument={instrumentId}
          chord={JSON.stringify(chordData)}
        ></chord-editor>
      {:else}
        <div class="loading">Loading chord editor...</div>
      {/if}
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

      <button type="button" class="btn btn-primary" onclick={saveSystemChord} disabled={saving || !chordData}>
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
    min-height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--spacing-lg);
  }

  .loading {
    color: var(--color-text-muted);
  }

  chord-editor {
    display: block;
    width: 100%;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-lg);
  }

  .form-group label {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .form-group textarea {
    width: 100%;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    font-family: inherit;
    resize: vertical;
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
</style>
