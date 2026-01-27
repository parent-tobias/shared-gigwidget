<script lang="ts">
  import { browser } from '$app/environment';
  import type { User, SubscriptionTier, Instrument } from '@gigwidget/core';
  import { TIER_INFO, getEffectiveTier, INSTRUMENTS } from '@gigwidget/core';
  import {
    initializeAuth,
    getAuthState,
    sendMagicLink,
    signInWithGoogle,
    signOut,
    isAuthenticated,
    getSupabaseEmail,
  } from '$lib/stores/authStore.svelte';
  import { getSyncState, forceSync, isSyncing, syncProfileToCloud } from '$lib/stores/syncStore.svelte';

  let user = $state<User | null>(null);
  let loading = $state(true);
  let hasLoaded = false;

  // Auth state
  const auth = getAuthState();
  const sync = getSyncState();
  let loginEmail = $state('');
  let magicLinkSent = $state(false);
  let authActionLoading = $state(false);
  let authActionError = $state<string | null>(null);

  // Profile editing state
  let editDisplayName = $state('');
  let editInstruments = $state<Instrument[]>([]);
  let avatarFile = $state<File | null>(null);
  let avatarPreview = $state<string | null>(null);
  let saving = $state(false);
  let profileError = $state<string | null>(null);
  let profileSuccess = $state(false);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    initializeAuth();
    loadUser();
  });

  async function handleForceSync() {
    await forceSync();
  }

  async function handleSendMagicLink() {
    if (!loginEmail.trim()) {
      authActionError = 'Please enter your email address';
      return;
    }

    authActionLoading = true;
    authActionError = null;

    const { error } = await sendMagicLink(loginEmail.trim());

    if (error) {
      authActionError = error;
    } else {
      magicLinkSent = true;
    }

    authActionLoading = false;
  }

  async function handleSignOut() {
    authActionLoading = true;
    authActionError = null;
    await signOut();
    authActionLoading = false;
  }

  async function handleGoogleSignIn() {
    authActionLoading = true;
    authActionError = null;

    const { error } = await signInWithGoogle();

    if (error) {
      authActionError = error;
      authActionLoading = false;
    }
    // If successful, the page will redirect to Google
  }

  // Sync form state with loaded user
  $effect(() => {
    if (user) {
      editDisplayName = user.displayName;
      editInstruments = [...user.instruments];
      if (user.avatar) {
        avatarPreview = URL.createObjectURL(user.avatar);
      }
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
    } finally {
      loading = false;
    }
  }

  function handleAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      profileError = 'Please select an image file';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      profileError = 'Image must be smaller than 2MB';
      return;
    }

    avatarFile = file;
    avatarPreview = URL.createObjectURL(file);
    profileError = null;
  }

  function toggleInstrument(instrument: Instrument) {
    if (editInstruments.includes(instrument)) {
      editInstruments = editInstruments.filter(i => i !== instrument);
    } else {
      editInstruments = [...editInstruments, instrument];
    }
  }

  async function saveProfile() {
    if (!user) return;
    if (!editDisplayName.trim()) {
      profileError = 'Display name is required';
      return;
    }

    saving = true;
    profileError = null;
    profileSuccess = false;

    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      const updates: Partial<User> = {
        displayName: editDisplayName.trim(),
        instruments: [...editInstruments],
      };

      let avatarBlob: Blob | undefined;
      if (avatarFile) {
        avatarBlob = new Blob([await avatarFile.arrayBuffer()], { type: avatarFile.type });
        updates.avatar = avatarBlob;
      }

      await db.users.update(user.id, updates);
      user = { ...user, ...updates };

      // Sync to cloud if authenticated
      if (isAuthenticated()) {
        const { error: syncError } = await syncProfileToCloud({
          displayName: editDisplayName.trim(),
          instruments: [...editInstruments],
          subscriptionTier: user.subscriptionTier,
          avatar: avatarBlob,
        });
        if (syncError) {
          console.warn('Profile saved locally but cloud sync failed:', syncError);
        }
      }

      avatarFile = null;
      profileSuccess = true;

      setTimeout(() => { profileSuccess = false; }, 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      profileError = err instanceof Error ? err.message : 'Failed to save profile';
    } finally {
      saving = false;
    }
  }

  async function setTier(tier: SubscriptionTier) {
    if (!user) return;
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      await db.users.update(user.id, { subscriptionTier: tier });
      user = { ...user, subscriptionTier: tier };
    } catch (err) {
      console.error('Failed to update tier:', err);
    }
  }

  const tiers: SubscriptionTier[] = ['free', 'basic', 'pro', 'mod'];
</script>

<svelte:head>
  <title>Account - Gigwidget</title>
</svelte:head>

<div class="account-page">
  <header class="page-header">
    <h1>Account</h1>
  </header>

  <!-- Cloud Sync / Auth Section -->
  <section class="section">
    <h2>Cloud Sync</h2>

    {#if auth.loading}
      <div class="loading">Checking login status...</div>
    {:else if isAuthenticated()}
      <div class="auth-status logged-in">
        <div class="auth-info">
          <span class="status-badge">Signed In</span>
          <p class="auth-email">{getSupabaseEmail()}</p>
          <p class="auth-desc">Your songs sync automatically across devices.</p>

          <!-- Sync Status -->
          <div class="sync-status">
            {#if sync.status === 'syncing'}
              <span class="sync-indicator syncing">Syncing...</span>
            {:else if sync.status === 'error'}
              <span class="sync-indicator error">Sync error: {sync.error}</span>
            {:else if sync.lastSyncAt}
              <span class="sync-indicator idle">
                Last synced: {sync.lastSyncAt.toLocaleTimeString()}
              </span>
            {:else}
              <span class="sync-indicator idle">Ready to sync</span>
            {/if}
            {#if sync.pendingChanges > 0}
              <span class="pending-badge">{sync.pendingChanges} pending</span>
            {/if}
          </div>
        </div>
        <div class="auth-actions">
          <button
            class="btn btn-secondary"
            onclick={handleForceSync}
            disabled={isSyncing()}
          >
            {isSyncing() ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            class="btn btn-secondary"
            onclick={handleSignOut}
            disabled={authActionLoading}
          >
            {authActionLoading ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>
    {:else}
      <div class="auth-status logged-out">
        {#if magicLinkSent}
          <div class="magic-link-sent">
            <h3>Check your email</h3>
            <p>We sent a magic link to <strong>{loginEmail}</strong></p>
            <p class="auth-desc">Click the link in the email to sign in. You can close this page.</p>
            <button class="btn btn-secondary" onclick={() => { magicLinkSent = false; loginEmail = ''; }}>
              Use a different email
            </button>
          </div>
        {:else}
          <p class="auth-desc">Sign in to sync your songs across all your devices.</p>

          {#if authActionError}
            <div class="error-message">{authActionError}</div>
          {/if}

          <!-- Social Login -->
          <div class="social-login">
            <button
              class="btn btn-google"
              onclick={handleGoogleSignIn}
              disabled={authActionLoading}
            >
              <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <div class="auth-divider">
            <span>or</span>
          </div>

          <!-- Magic Link -->
          <form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleSendMagicLink(); }}>
            <div class="form-group">
              <label for="login-email">Email address</label>
              <input
                type="email"
                id="login-email"
                bind:value={loginEmail}
                placeholder="you@example.com"
                disabled={authActionLoading}
                required
              />
            </div>
            <button type="submit" class="btn btn-secondary" disabled={authActionLoading}>
              {authActionLoading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        {/if}
      </div>
    {/if}
  </section>

  {#if loading}
    <div class="loading">Loading...</div>
  {:else if user}
    <section class="section">
      <h2>Profile</h2>

      {#if profileError}
        <div class="error-message">{profileError}</div>
      {/if}
      {#if profileSuccess}
        <div class="success-message">Profile saved successfully!</div>
      {/if}

      <form class="profile-form" onsubmit={(e) => { e.preventDefault(); saveProfile(); }}>
        <div class="form-group avatar-group">
          <label>Avatar</label>
          <div class="avatar-upload">
            <div class="avatar-preview">
              {#if avatarPreview}
                <img src={avatarPreview} alt="Avatar preview" />
              {:else}
                <span class="avatar-placeholder">{user.displayName?.charAt(0) ?? '?'}</span>
              {/if}
            </div>
            <input
              type="file"
              accept="image/*"
              onchange={handleAvatarChange}
              disabled={saving}
              id="avatar-input"
            />
            <label for="avatar-input" class="btn btn-secondary">
              Change Avatar
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="displayName">Display Name *</label>
          <input
            type="text"
            id="displayName"
            bind:value={editDisplayName}
            placeholder="Your display name"
            required
            disabled={saving}
          />
        </div>

        <div class="form-group">
          <label>Instruments</label>
          <div class="instrument-grid">
            {#each INSTRUMENTS as instrument}
              <button
                type="button"
                class="instrument-chip"
                class:selected={editInstruments.includes(instrument)}
                onclick={() => toggleInstrument(instrument)}
                disabled={saving}
              >
                {instrument.charAt(0).toUpperCase() + instrument.slice(1)}
              </button>
            {/each}
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </section>

    <section class="section">
      <h2>Current Plan</h2>
      <div class="plan-card active">
        <span class="plan-name">{TIER_INFO[getEffectiveTier(user)].displayName}</span>
        <p class="plan-desc">{TIER_INFO[getEffectiveTier(user)].description}</p>
      </div>
    </section>

    <section class="section">
      <h2>Available Plans</h2>
      <div class="plans-grid">
        {#each tiers as tier}
          {@const info = TIER_INFO[tier]}
          {@const isCurrent = user.subscriptionTier === tier}
          <div class="plan-card" class:active={isCurrent}>
            <h3>{info.displayName}</h3>
            <p class="plan-desc">{info.description}</p>
            {#if info.price}
              <p class="plan-price">{info.price}</p>
            {:else}
              <p class="plan-price">Free</p>
            {/if}
            <ul class="features">
              {#each info.features as feature}
                <li>{feature}</li>
              {/each}
            </ul>
            {#if isCurrent}
              <span class="current-badge">Current Plan</span>
            {:else}
              <button class="btn btn-primary" onclick={() => setTier(tier)}>
                Select Plan
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .account-page {
    max-width: 800px;
  }

  .page-header {
    margin-bottom: var(--spacing-lg);
  }

  .page-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
  }

  .section {
    margin-bottom: var(--spacing-xl);
    padding-bottom: var(--spacing-xl);
    border-bottom: 1px solid var(--color-border);
  }

  .section:last-child {
    border-bottom: none;
  }

  .section h2 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: var(--spacing-md);
  }

  /* Auth Section */
  .auth-status.logged-in {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
    background: var(--color-bg-secondary);
    padding: var(--spacing-lg);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
  }

  .auth-info {
    flex: 1;
  }

  .status-badge {
    display: inline-block;
    background: #4ade80;
    color: #000;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .auth-email {
    font-weight: 500;
    margin: var(--spacing-sm) 0 0;
  }

  .auth-desc {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: var(--spacing-xs) 0 0;
  }

  .auth-actions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .sync-status {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }

  .sync-indicator {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .sync-indicator.syncing {
    color: var(--color-primary);
  }

  .sync-indicator.error {
    color: #ef4444;
  }

  .pending-badge {
    font-size: 0.65rem;
    background: var(--color-primary);
    color: white;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .social-login {
    margin-bottom: var(--spacing-md);
  }

  .btn-google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    width: 100%;
    max-width: 400px;
    padding: var(--spacing-md);
    background: white;
    color: #333;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-google:hover:not(:disabled) {
    background: #f8f8f8;
    border-color: #ccc;
  }

  .btn-google:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .google-icon {
    flex-shrink: 0;
  }

  .auth-divider {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    max-width: 400px;
    margin-bottom: var(--spacing-md);
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .auth-divider::before,
  .auth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }

  .auth-form {
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .magic-link-sent {
    background: rgba(74, 222, 128, 0.1);
    border: 1px solid #4ade80;
    padding: var(--spacing-lg);
    border-radius: var(--radius-lg);
  }

  .magic-link-sent h3 {
    color: #4ade80;
    margin: 0 0 var(--spacing-sm);
  }

  .magic-link-sent p {
    margin: 0 0 var(--spacing-sm);
  }

  /* Profile Form */
  .profile-form {
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .form-group label {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .avatar-group {
    align-items: flex-start;
  }

  .avatar-upload {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .avatar-preview {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    overflow: hidden;
    background-color: var(--color-bg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-border);
  }

  .avatar-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    font-size: 2rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .avatar-upload input[type="file"] {
    display: none;
  }

  .instrument-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .instrument-chip {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--transition-fast);
    color: var(--color-text);
  }

  .instrument-chip:hover:not(:disabled) {
    background-color: var(--color-surface);
  }

  .instrument-chip.selected {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .instrument-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-actions {
    padding-top: var(--spacing-md);
  }

  /* Plans */
  .plans-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--spacing-md);
  }

  .plan-card {
    background: var(--color-bg-secondary);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
  }

  .plan-card.active {
    border-color: var(--color-primary);
  }

  .plan-name {
    font-weight: 600;
  }

  .plan-desc {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .plan-price {
    font-size: 1.25rem;
    font-weight: 600;
    margin: var(--spacing-sm) 0;
  }

  .features {
    list-style: none;
    padding: 0;
    margin: var(--spacing-md) 0;
    font-size: 0.875rem;
  }

  .features li {
    padding: var(--spacing-xs) 0;
    color: var(--color-text-muted);
  }

  .features li::before {
    content: "✓ ";
    color: var(--color-primary);
  }

  .current-badge {
    display: inline-block;
    background: var(--color-primary);
    color: white;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
  }

  /* Messages */
  .success-message {
    background-color: rgba(74, 222, 128, 0.1);
    border: 1px solid #4ade80;
    color: #4ade80;
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .auth-status.logged-in {
      flex-direction: column;
    }

    .auth-status.logged-in .btn {
      width: 100%;
    }

    .auth-form,
    .profile-form {
      max-width: 100%;
    }

    .plans-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
