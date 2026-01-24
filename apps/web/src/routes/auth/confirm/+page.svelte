<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { supabase } from '$lib/stores/supabaseStore';
  import { initializeAuth } from '$lib/stores/authStore.svelte';

  let status = $state<'verifying' | 'success' | 'error'>('verifying');
  let errorMessage = $state<string | null>(null);

  onMount(async () => {
    console.log('[Auth Confirm] onMount started');

    try {
      initializeAuth();
      console.log('[Auth Confirm] initializeAuth called');
    } catch (err) {
      console.error('[Auth Confirm] initializeAuth failed:', err);
    }

    const token_hash = $page.url.searchParams.get('token_hash');
    const type = $page.url.searchParams.get('type') as 'email' | 'recovery' | 'invite' | 'magiclink' | null;

    console.log('[Auth Confirm] Starting verification with:', { token_hash: token_hash?.slice(0, 8) + '...', type });

    if (!token_hash || !type) {
      status = 'error';
      errorMessage = 'Invalid confirmation link. Missing required parameters.';
      return;
    }

    try {
      console.log('[Auth Confirm] Calling verifyOtp with:', { token_hash: token_hash?.slice(0, 8) + '...', type });
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash,
        type,
      });
      console.log('[Auth Confirm] verifyOtp completed:', { hasData: !!data, hasSession: !!data?.session, error: error?.message });

      if (error) {
        status = 'error';
        errorMessage = error.message;
        console.error('[Auth Confirm] Verification error:', error);
      } else {
        status = 'success';
        console.log('[Auth Confirm] Success! Redirecting...');
        // Redirect to account page after a brief moment
        setTimeout(() => {
          goto('/account');
        }, 1500);
      }
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : 'Verification failed';
      console.error('[Auth Confirm] Verification exception:', err);
    }
  });
</script>

<svelte:head>
  <title>Confirming... | GigWidget</title>
</svelte:head>

<main class="confirm-page">
  {#if status === 'verifying'}
    <div class="status-card">
      <div class="spinner"></div>
      <h1>Verifying your email...</h1>
      <p>Please wait while we confirm your login.</p>
    </div>
  {:else if status === 'success'}
    <div class="status-card success">
      <div class="checkmark">✓</div>
      <h1>Email verified!</h1>
      <p>Redirecting you to your account...</p>
    </div>
  {:else if status === 'error'}
    <div class="status-card error">
      <div class="error-icon">✕</div>
      <h1>Verification failed</h1>
      <p>{errorMessage || 'Something went wrong. Please try again.'}</p>
      <a href="/account" class="retry-link">Back to login</a>
    </div>
  {/if}
</main>

<style>
  .confirm-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: var(--color-background, #1a1a1a);
  }

  .status-card {
    text-align: center;
    padding: 3rem 2rem;
    background: var(--color-surface, #2a2a2a);
    border-radius: 1rem;
    max-width: 400px;
    width: 100%;
  }

  .status-card h1 {
    margin: 1rem 0 0.5rem;
    font-size: 1.5rem;
    color: var(--color-text, #fff);
  }

  .status-card p {
    color: var(--color-text-muted, #aaa);
    margin: 0;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--color-border, #444);
    border-top-color: var(--color-primary, #646cff);
    border-radius: 50%;
    margin: 0 auto;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .checkmark {
    width: 48px;
    height: 48px;
    background: #22c55e;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    font-size: 1.5rem;
    color: white;
  }

  .error-icon {
    width: 48px;
    height: 48px;
    background: #ef4444;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    font-size: 1.5rem;
    color: white;
  }

  .success h1 {
    color: #22c55e;
  }

  .error h1 {
    color: #ef4444;
  }

  .retry-link {
    display: inline-block;
    margin-top: 1.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--color-primary, #646cff);
    color: white;
    text-decoration: none;
    border-radius: 0.5rem;
    transition: opacity 0.2s;
  }

  .retry-link:hover {
    opacity: 0.9;
  }
</style>
