<script lang="ts">
  import { browser } from '$app/environment';
  import { toast } from '$lib/stores/toastStore.svelte';
  import type { CustomInstrument } from '@gigwidget/core';
  import type {
    ExportFormat,
    ExportSortOrder,
    ExportSongData,
    ExportOptions,
  } from '$lib/services/exportService';

  const BUILT_IN_INSTRUMENTS = [
    { id: 'guitar', name: 'Standard Guitar' },
    { id: 'guitar-drop-d', name: 'Drop-D Guitar' },
    { id: 'ukulele', name: 'Standard Ukulele' },
    { id: 'baritone-ukulele', name: 'Baritone Ukulele' },
    { id: 'ukulele-5ths', name: '5ths tuned Ukulele' },
    { id: 'mandolin', name: 'Standard Mandolin' },
  ] as const;

  interface Props {
    songs: ExportSongData[];
    mode: 'single' | 'collection' | 'multi-select';
    collectionName?: string;
    onClose: () => void;
  }

  let { songs, mode, collectionName, onClose }: Props = $props();

  let format = $state<ExportFormat>('chordpro');
  let includeChordDiagrams = $state(true);
  let diagramInstrument = $state('guitar');
  let customInstruments = $state<CustomInstrument[]>([]);
  let sortOrder = $state<ExportSortOrder>('as-is');
  let exporting = $state(false);
  let hasLoadedPrefs = false;

  const isMulti = $derived(mode !== 'single');
  const songCount = $derived(songs.length);

  // Load user's default instrument preference and custom instruments
  $effect(() => {
    if (!browser || hasLoadedPrefs) return;
    hasLoadedPrefs = true;

    (async () => {
      try {
        const { getDatabase } = await import('@gigwidget/db');
        const { CustomInstrumentRepository } = await import('@gigwidget/db');
        const db = getDatabase();
        const users = await db.users.toArray();
        if (users.length > 0) {
          const prefs = await db.userPreferences.where('userId').equals(users[0].id).first();
          if (prefs?.defaultInstrument) {
            diagramInstrument = prefs.defaultInstrument;
          }
          customInstruments = await CustomInstrumentRepository.getByUser(users[0].id);
        }
      } catch {
        // Keep default
      }
    })();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  async function handleExport() {
    exporting = true;

    try {
      const {
        exportSingleChordPro,
        exportMultipleChordPro,
        exportSinglePdf,
        exportMultiplePdf,
      } = await import('$lib/services/exportService');

      const options: ExportOptions = {
        format,
        includeChordDiagrams,
        instrumentId: diagramInstrument,
        sortOrder,
      };

      // Apply sort if needed
      let sortedSongs = songs;
      if (isMulti && sortOrder === 'alphabetical') {
        sortedSongs = [...songs].sort((a, b) => a.song.title.localeCompare(b.song.title));
      }

      if (format === 'chordpro') {
        if (isMulti) {
          await exportMultipleChordPro(sortedSongs, collectionName);
        } else {
          exportSingleChordPro(sortedSongs[0]);
        }
      } else {
        if (isMulti) {
          await exportMultiplePdf(sortedSongs, options, collectionName);
        } else {
          await exportSinglePdf(sortedSongs[0], options);
        }
      }

      toast.success(`Exported ${isMulti ? songCount + ' songs' : 'song'} successfully`);
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      exporting = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={onClose}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <h2>Export {isMulti ? `${songCount} Songs` : 'Song'}</h2>

    <div class="form-section">
      <label class="section-label">Format</label>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" bind:group={format} value="chordpro" disabled={exporting} />
          <span>ChordPro (.chopro){isMulti ? ' — zip archive' : ''}</span>
        </label>
        <label class="radio-label">
          <input type="radio" bind:group={format} value="pdf" disabled={exporting} />
          <span>PDF{isMulti ? ' — multi-page' : ''}</span>
        </label>
      </div>
    </div>

    {#if format === 'pdf'}
      <div class="form-section">
        <label class="section-label">PDF Options</label>
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={includeChordDiagrams} disabled={exporting} />
          <span>Include chord diagrams</span>
        </label>
        {#if includeChordDiagrams}
          <div class="instrument-select">
            <label for="diagram-instrument">Instrument</label>
            <select id="diagram-instrument" bind:value={diagramInstrument} disabled={exporting}>
              {#each BUILT_IN_INSTRUMENTS as instrument}
                <option value={instrument.id}>{instrument.name}</option>
              {/each}
              {#if customInstruments.length > 0}
                <optgroup label="Custom Instruments">
                  {#each customInstruments as instrument}
                    <option value={instrument.id}>{instrument.name}</option>
                  {/each}
                </optgroup>
              {/if}
            </select>
          </div>
        {/if}
      </div>
    {/if}

    {#if isMulti}
      <div class="form-section">
        <label class="section-label">Sort Order</label>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" bind:group={sortOrder} value="as-is" disabled={exporting} />
            <span>As-is</span>
          </label>
          <label class="radio-label">
            <input type="radio" bind:group={sortOrder} value="alphabetical" disabled={exporting} />
            <span>Alphabetical</span>
          </label>
          {#if mode === 'collection'}
            <label class="radio-label">
              <input type="radio" bind:group={sortOrder} value="set-order" disabled={exporting} />
              <span>Collection order</span>
            </label>
          {/if}
        </div>
      </div>
    {/if}

    <div class="modal-actions">
      <button class="btn btn-secondary" onclick={onClose} disabled={exporting}>
        Cancel
      </button>
      <button class="btn btn-primary" onclick={handleExport} disabled={exporting || songs.length === 0}>
        {exporting ? 'Exporting...' : 'Export'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
    max-width: 420px;
    width: 90%;
  }

  .modal h2 {
    margin: 0 0 var(--spacing-lg) 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .form-section {
    margin-bottom: var(--spacing-lg);
  }

  .section-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-sm);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .radio-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .radio-label,
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .radio-label input,
  .checkbox-label input {
    width: auto;
    cursor: pointer;
  }

  .instrument-select {
    margin-top: var(--spacing-sm);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: 0.875rem;
  }

  .instrument-select label {
    white-space: nowrap;
    color: var(--color-text-muted);
  }

  .instrument-select select {
    flex: 1;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-secondary);
    color: var(--color-text);
    font-size: 0.875rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }
</style>
