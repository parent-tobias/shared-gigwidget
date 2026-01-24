<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="settings-shell">
  {@render children()}
</div>

<style>
  .settings-shell {
    height: 100%;
    overflow: auto;
  }
</style>
