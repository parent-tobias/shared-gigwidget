<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';

  $effect(() => {
    if (browser) {
      goto('/settings/account', { replaceState: true });
    }
  });
</script>

<div class="redirect-loading">
  <p>Redirecting...</p>
</div>

<style>
  .redirect-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    color: var(--color-text-muted);
  }
</style>
