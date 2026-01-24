<script lang="ts">
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  // Determine if we're on a detail view (has an ID in the URL)
  let isDetailView = $derived(
    $page.params.id !== undefined ||
    $page.url.pathname.match(/\/(library|browse|collections)\/[^/]+$/)
  );
</script>

<div class="app-layout" class:detail-view={isDetailView}>
  {@render children()}
</div>

<style>
  .app-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* On desktop, this layout will be used by child routes
     which handle their own list+content split */
</style>
