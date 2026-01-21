<script lang="ts">
  import { browser } from '$app/environment';
  import type { LocalFingering, CustomInstrument, Instrument, FingeringBarre } from '@gigwidget/core';

  interface Props {
    chordName: string;
    instrumentId?: string;
    existingFingering?: LocalFingering;
    onSave?: (fingering: LocalFingering) => void;
    onCancel?: () => void;
  }

  let { chordName, instrumentId, existingFingering, onSave, onCancel }: Props = $props();

  // Form state
  let positions = $state<number[]>(existingFingering?.positions ?? [-1, -1, -1, -1, -1, -1]);
  let fingers = $state<number[]>(existingFingering?.fingers ?? [0, 0, 0, 0, 0, 0]);
  let baseFret = $state(existingFingering?.baseFret ?? 1);
  let barres = $state<FingeringBarre[]>(existingFingering?.barres ?? []);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let componentReady = $state(false);
  let instrument = $state<CustomInstrument | null>(null);
  let hasLoaded = false;

  // String labels based on instrument
  const defaultStrings = ['E', 'A', 'D', 'G', 'B', 'e'];

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;

    loadDependencies();
  });

  async function loadDependencies() {
    try {
      await import('@parent-tobias/chord-component');
      componentReady = true;
    } catch (err) {
      console.error('Failed to load chord-component:', err);
    }

    if (instrumentId) {
      try {
        const { CustomInstrumentRepository } = await import('@gigwidget/db');
        instrument = await CustomInstrumentRepository.getById(instrumentId);
        if (instrument) {
          // Adjust positions array to match string count
          const stringCount = instrument.strings.length;
          if (positions.length !== stringCount) {
            positions = Array(stringCount).fill(-1);
            fingers = Array(stringCount).fill(0);
          }
        }
      } catch (err) {
        console.error('Failed to load instrument:', err);
      }
    }
  }

  function getStringLabels(): string[] {
    if (instrument) {
      return instrument.strings.map((s) => s.replace(/\d+$/, ''));
    }
    return defaultStrings;
  }

  function updatePosition(stringIndex: number, value: number) {
    positions = positions.map((p, i) => (i === stringIndex ? value : p));
  }

  function updateFinger(stringIndex: number, value: number) {
    fingers = fingers.map((f, i) => (i === stringIndex ? value : f));
  }

  function cyclePosition(stringIndex: number) {
    const current = positions[stringIndex];
    // Cycle: -1 (muted) -> 0 (open) -> 1 -> 2 -> ... -> 5 -> -1
    const next = current === -1 ? 0 : current >= 5 ? -1 : current + 1;
    updatePosition(stringIndex, next);
  }

  function addBarre() {
    barres = [...barres, { fret: baseFret, fromString: 0, toString: positions.length - 1 }];
  }

  function removeBarre(index: number) {
    barres = barres.filter((_, i) => i !== index);
  }

  function updateBarre(index: number, field: keyof FingeringBarre, value: number) {
    barres = barres.map((b, i) =>
      i === index ? { ...b, [field]: value } : b
    );
  }

  async function saveFingering() {
    error = null;
    saving = true;

    try {
      const { LocalFingeringRepository, getDatabase } = await import('@gigwidget/db');
      const { generateId } = await import('@gigwidget/core');
      const db = getDatabase();

      const users = await db.users.toArray();
      if (users.length === 0) {
        error = 'No user found';
        saving = false;
        return;
      }

      const userId = users[0].id;
      const targetInstrumentId = instrumentId || 'guitar';

      const fingering: LocalFingering = {
        id: existingFingering?.id ?? generateId(),
        userId,
        chordName,
        instrumentId: targetInstrumentId,
        positions: [...positions],
        fingers: fingers.some((f) => f > 0) ? [...fingers] : undefined,
        barres: barres.length > 0 ? [...barres] : undefined,
        baseFret,
        isDefault: existingFingering?.isDefault ?? false,
        createdAt: existingFingering?.createdAt ?? new Date(),
      };

      if (existingFingering) {
        await LocalFingeringRepository.update(fingering.id, fingering);
      } else {
        await LocalFingeringRepository.create(fingering);
      }

      onSave?.(fingering);
    } catch (err) {
      console.error('Failed to save fingering:', err);
      error = 'Failed to save fingering';
    } finally {
      saving = false;
    }
  }

  function getChordData() {
    return JSON.stringify({
      positions,
      fingers: fingers.some((f) => f > 0) ? fingers : undefined,
      barres: barres.length > 0 ? barres : undefined,
      baseFret,
    });
  }
</script>

<div class="chord-editor">
  <div class="editor-header">
    <h3>Edit Fingering: {chordName}</h3>
    {#if instrument}
      <span class="instrument-badge">{instrument.name}</span>
    {/if}
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="editor-content">
    <div class="preview-section">
      {#if componentReady}
        <chord-diagram chord={getChordData()} size="large"></chord-diagram>
      {:else}
        <div class="preview-fallback">
          <span class="positions-display">
            {positions.map((p) => (p === -1 ? 'x' : p)).join(' ')}
          </span>
        </div>
      {/if}
    </div>

    <div class="controls-section">
      <div class="form-group">
        <label>Base Fret</label>
        <input
          type="number"
          bind:value={baseFret}
          min="1"
          max="20"
          disabled={saving}
        />
      </div>

      <div class="form-group">
        <label>String Positions (tap to cycle)</label>
        <div class="string-controls">
          {#each getStringLabels() as stringLabel, i}
            <div class="string-control">
              <span class="string-label">{stringLabel}</span>
              <button
                type="button"
                class="position-btn"
                onclick={() => cyclePosition(i)}
                disabled={saving}
              >
                {positions[i] === -1 ? 'x' : positions[i]}
              </button>
              <select
                class="finger-select"
                value={fingers[i]}
                onchange={(e) => updateFinger(i, parseInt(e.currentTarget.value))}
                disabled={saving}
              >
                <option value="0">-</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label>Barres</label>
        {#each barres as barre, i}
          <div class="barre-control">
            <span>Fret:</span>
            <input
              type="number"
              value={barre.fret}
              onchange={(e) => updateBarre(i, 'fret', parseInt(e.currentTarget.value))}
              min="1"
              max="20"
              disabled={saving}
            />
            <span>From:</span>
            <input
              type="number"
              value={barre.fromString}
              onchange={(e) => updateBarre(i, 'fromString', parseInt(e.currentTarget.value))}
              min="0"
              max={positions.length - 1}
              disabled={saving}
            />
            <span>To:</span>
            <input
              type="number"
              value={barre.toString}
              onchange={(e) => updateBarre(i, 'toString', parseInt(e.currentTarget.value))}
              min="0"
              max={positions.length - 1}
              disabled={saving}
            />
            <button type="button" class="btn-remove-barre" onclick={() => removeBarre(i)} disabled={saving}>
              x
            </button>
          </div>
        {/each}
        <button type="button" class="btn btn-secondary btn-sm" onclick={addBarre} disabled={saving}>
          + Add Barre
        </button>
      </div>
    </div>
  </div>

  <div class="editor-actions">
    {#if onCancel}
      <button type="button" class="btn btn-secondary" onclick={onCancel} disabled={saving}>
        Cancel
      </button>
    {/if}
    <button type="button" class="btn btn-primary" onclick={saveFingering} disabled={saving}>
      {saving ? 'Saving...' : 'Save Fingering'}
    </button>
  </div>
</div>

<style>
  .chord-editor {
    background-color: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-lg);
  }

  .editor-header h3 {
    margin: 0;
  }

  .instrument-badge {
    font-size: 0.75rem;
    background-color: var(--color-surface);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    padding: var(--spacing-sm);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .editor-content {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--spacing-lg);
  }

  .preview-section {
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  chord-diagram {
    display: block;
    width: 150px;
    height: 180px;
  }

  .preview-fallback {
    width: 150px;
    height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-surface);
    border-radius: var(--radius-md);
  }

  .positions-display {
    font-family: monospace;
    font-size: 1.25rem;
  }

  .controls-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .form-group input[type='number'] {
    width: 80px;
  }

  .string-controls {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .string-control {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .string-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .position-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .position-btn:hover {
    background-color: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .finger-select {
    width: 36px;
    padding: var(--spacing-xs);
    font-size: 0.75rem;
  }

  .barre-control {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
    margin-bottom: var(--spacing-xs);
  }

  .barre-control input {
    width: 50px;
  }

  .barre-control span {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .btn-remove-barre {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: 1rem;
    cursor: pointer;
    padding: var(--spacing-xs);
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.75rem;
  }

  .editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  @media (max-width: 600px) {
    .editor-content {
      grid-template-columns: 1fr;
    }

    .preview-section {
      justify-content: center;
    }
  }
</style>
