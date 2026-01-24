<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';

  // For now, redirect to the existing song detail page
  // This will be refactored later to show the song in the content pane
  $effect(() => {
    if (!browser) return;
    const id = $page.params.id;
    if (id) {
      goto(`/songs/${id}`, { replaceState: true });
    }
  });
</script>

<div class="loading">
  <p>Loading song...</p>
</div>

<style>
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
  }
</style>
