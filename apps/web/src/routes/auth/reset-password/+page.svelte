<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import {
    initializeAuth,
    updatePassword,
    validatePassword,
    isAuthenticated,
  } from '$lib/stores/authStore.svelte';

  let newPassword = $state('');
  let confirmPassword = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);
  let passwordErrors = $state<string[]>([]);

  $effect(() => {
    if (browser) {
      initializeAuth();
    }
  });

  function handlePasswordInput() {
    if (newPassword) {
      const validation = validatePassword(newPassword);
      passwordErrors = validation.errors;
    } else {
      passwordErrors = [];
    }
  }

  async function handleSubmit() {
    error = null;

    if (!newPassword) {
      error = 'Please enter a new password';
      return;
    }

    if (newPassword !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      error = validation.errors.join('. ');
      return;
    }

    loading = true;

    const { error: updateError } = await updatePassword(newPassword);

    if (updateError) {
      error = updateError;
      loading = false;
      return;
    }

    success = true;
    loading = false;

    // Redirect to account page after a short delay
    setTimeout(() => {
      goto('/settings/account');
    }, 2000);
  }
</script>

<svelte:head>
  <title>Reset Password - Gigwidget</title>
</svelte:head>

<div class="reset-page">
  <div class="reset-card">
    <h1>Reset Password</h1>

    {#if success}
      <div class="success-message">
        <h3>Password updated!</h3>
        <p>Your password has been reset successfully. Redirecting to your account...</p>
      </div>
    {:else}
      <p class="desc">Enter your new password below.</p>

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div class="form-group">
          <label for="new-password">New Password</label>
          <input
            type="password"
            id="new-password"
            bind:value={newPassword}
            oninput={handlePasswordInput}
            placeholder="Enter new password"
            disabled={loading}
            required
          />
          {#if passwordErrors.length > 0}
            <ul class="password-requirements">
              {#each passwordErrors as err}
                <li class="requirement-error">{err}</li>
              {/each}
            </ul>
          {:else if newPassword.length > 0}
            <p class="password-valid">Password meets requirements</p>
          {/if}
        </div>

        <div class="form-group">
          <label for="confirm-password">Confirm Password</label>
          <input
            type="password"
            id="confirm-password"
            bind:value={confirmPassword}
            placeholder="Confirm new password"
            disabled={loading}
            required
          />
        </div>

        <button type="submit" class="btn btn-primary" disabled={loading || passwordErrors.length > 0}>
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .reset-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-lg);
    background: var(--color-bg);
  }

  .reset-card {
    width: 100%;
    max-width: 400px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
  }

  h1 {
    font-size: 1.5rem;
    margin: 0 0 var(--spacing-sm);
  }

  .desc {
    color: var(--color-text-muted);
    margin: 0 0 var(--spacing-lg);
  }

  form {
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
  }

  .form-group input {
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 1rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .btn-primary {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-weight: 500;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .success-message {
    background: rgba(74, 222, 128, 0.1);
    border: 1px solid #4ade80;
    padding: var(--spacing-lg);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .success-message h3 {
    color: #4ade80;
    margin: 0 0 var(--spacing-sm);
  }

  .success-message p {
    margin: 0;
    color: var(--color-text-muted);
  }

  .error-message {
    background: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .password-requirements {
    list-style: none;
    padding: 0;
    margin: var(--spacing-xs) 0 0;
    font-size: 0.75rem;
  }

  .requirement-error {
    color: #ef4444;
    padding: 2px 0;
  }

  .requirement-error::before {
    content: "x ";
  }

  .password-valid {
    color: #4ade80;
    font-size: 0.75rem;
    margin: var(--spacing-xs) 0 0;
  }

  .password-valid::before {
    content: "v ";
  }
</style>
