<script lang="ts">
  import { browser } from '$app/environment';
  import type { User, SubscriptionTier, Instrument, CustomInstrument } from '@gigwidget/core';
  import { TIER_INFO, getEffectiveTier, getUserPermissions, INSTRUMENTS } from '@gigwidget/core';
  import {
    initializeAuth,
    getAuthState,
    sendMagicLink,
    signOut,
    isAuthenticated,
    getSupabaseEmail,
  } from '$lib/stores/authStore.svelte';
  import { getSyncState, forceSync, isSyncing, syncProfileToCloud, syncPreferencesToCloud } from '$lib/stores/syncStore.svelte';

  // Built-in instruments that the chordpro-renderer supports
  const RENDERER_INSTRUMENTS = [
    'Standard Guitar',
    'Drop-D Guitar',
    'Standard Ukulele',
    'Baritone Ukulele',
    '5ths tuned Ukulele',
    'Standard Mandolin',
  ] as const;

  let user = $state<User | null>(null);
  let loading = $state(true);
  let hasLoaded = false;
  let customInstruments = $state<CustomInstrument[]>([]);

  // Auth state
  const auth = getAuthState();
  const sync = getSyncState();
  let loginEmail = $state('');
  let magicLinkSent = $state(false);
  let authActionLoading = $state(false);
  let authActionError = $state<string | null>(null);

  async function handleForceSync() {
    await forceSync();
  }

  // Profile editing state
  let editDisplayName = $state('');
  let editInstruments = $state<Instrument[]>([]);
  let avatarFile = $state<File | null>(null);
  let avatarPreview = $state<string | null>(null);
  let saving = $state(false);
  let profileError = $state<string | null>(null);
  let profileSuccess = $state(false);

  // Preferences state
  let defaultInstrument = $state<string>('');
  let chordListPosition = $state<'top' | 'right' | 'bottom'>('top');
  let theme = $state<'light' | 'dark' | 'auto'>('auto');
  let compactView = $state(false);
  let preferencesLoading = $state(true);
  let preferencesSaving = $state(false);
  let preferencesError = $state<string | null>(null);
  let preferencesSuccess = $state(false);

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    initializeAuth();
    loadUser();
    loadPreferences();
    loadCustomInstruments();
  });

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

  async function loadPreferences() {
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const users = await db.users.toArray();
      if (users.length > 0) {
        const prefs = await db.userPreferences.where('userId').equals(users[0].id).first();
        if (prefs) {
          if (prefs.defaultInstrument) defaultInstrument = prefs.defaultInstrument;
          if (prefs.chordListPosition) chordListPosition = prefs.chordListPosition;
          if (prefs.theme) theme = prefs.theme;
          if (prefs.compactView) compactView = prefs.compactView;
        }
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    } finally {
      preferencesLoading = false;
    }
  }

  async function loadCustomInstruments() {
    try {
      const { CustomInstrumentRepository, getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const users = await db.users.toArray();
      if (users.length > 0) {
        customInstruments = await CustomInstrumentRepository.getByUser(users[0].id);
      }
    } catch (err) {
      console.error('Failed to load custom instruments:', err);
    }
  }

  async function savePreferences() {
    if (!user) return;

    preferencesSaving = true;
    preferencesError = null;
    preferencesSuccess = false;

    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();

      const prefs = await db.userPreferences.where('userId').equals(user.id).first();
      const prefsData = {
        defaultInstrument: defaultInstrument || undefined,
        chordListPosition,
        theme,
        compactView,
      };
      if (prefs) {
        await (db.userPreferences.where('userId').equals(user.id).modify as any)(prefsData);
      } else {
        await (db.userPreferences.add as any)({
          userId: user.id,
          autoSaveInterval: 5000,
          snapshotRetention: 10,
          ...prefsData,
        });
      }

      // Sync to cloud if authenticated
      if (isAuthenticated()) {
        const { error: syncError } = await syncPreferencesToCloud({
          defaultInstrument: defaultInstrument || undefined,
          chordListPosition,
          theme,
          compactView,
        });
        if (syncError) {
          console.warn('Preferences saved locally but cloud sync failed:', syncError);
        }
      }

      preferencesSuccess = true;
      setTimeout(() => { preferencesSuccess = false; }, 3000);
    } catch (err) {
      console.error('Failed to save preferences:', err);
      preferencesError = err instanceof Error ? err.message : 'Failed to save preferences';
    } finally {
      preferencesSaving = false;
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
        // Convert File to Blob to avoid serialization issues
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

<main class="container">
  <header class="page-header">
    <a href="/" class="back-link">&larr; Home</a>
    <h1>Account</h1>
  </header>

  <!-- Cloud Sync / Auth Section -->
  <section class="auth-section">
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
            <button type="submit" class="btn btn-primary" disabled={authActionLoading}>
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
    <section class="profile-section">
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

    <section class="preferences-section">
      <h2>Viewer Preferences</h2>

      {#if preferencesError}
        <div class="error-message">{preferencesError}</div>
      {/if}
      {#if preferencesSuccess}
        <div class="success-message">Preferences saved!</div>
      {/if}

      {#if preferencesLoading}
        <div class="loading">Loading preferences...</div>
      {:else}
        <form class="preferences-form" onsubmit={(e) => { e.preventDefault(); savePreferences(); }}>
          <div class="form-group">
            <label for="defaultInstrument">Default Instrument</label>
            <select
              id="defaultInstrument"
              bind:value={defaultInstrument}
              disabled={preferencesSaving}
            >
              <option value="">None</option>
              <optgroup label="Built-in Instruments">
                {#each RENDERER_INSTRUMENTS as instrument}
                  <option value={instrument}>{instrument}</option>
                {/each}
              </optgroup>
              {#if customInstruments.length > 0}
                <optgroup label="Custom Instruments">
                  {#each customInstruments as instrument}
                    <option value={instrument.id}>{instrument.name}</option>
                  {/each}
                </optgroup>
              {/if}
            </select>
            <p class="form-help">Instrument for chord diagrams when viewing songs</p>
          </div>

          <div class="form-group">
            <label for="chordListPosition">Chord List Position</label>
            <select
              id="chordListPosition"
              bind:value={chordListPosition}
              disabled={preferencesSaving}
            >
              <option value="top">Top</option>
              <option value="right">Right</option>
              <option value="bottom">Bottom</option>
            </select>
            <p class="form-help">Choose where chord diagrams appear when viewing songs</p>
          </div>

          <div class="form-group">
            <label for="theme">Theme</label>
            <select
              id="theme"
              bind:value={theme}
              disabled={preferencesSaving}
            >
              <option value="auto">Auto (system preference)</option>
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
            </select>
            <p class="form-help">Choose your preferred color theme</p>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                bind:checked={compactView}
                disabled={preferencesSaving}
              />
              <span>Compact View</span>
            </label>
            <p class="form-help">Use a more compact UI layout with reduced spacing</p>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" disabled={preferencesSaving}>
              {preferencesSaving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      {/if}
    </section>

    <section class="current-plan">
      <h2>Current Plan</h2>
      <div class="plan-card active">
        <span class="plan-name">{TIER_INFO[getEffectiveTier(user)].displayName}</span>
        <p class="plan-desc">{TIER_INFO[getEffectiveTier(user)].description}</p>
      </div>
    </section>

    <section class="plans">
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
</main>

<style>
  .page-header {
    padding: var(--spacing-lg) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .back-link {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  /* Auth Section */
  .auth-section {
    margin-top: var(--spacing-xl);
    padding-bottom: var(--spacing-xl);
    border-bottom: 1px solid var(--color-border);
  }

  .auth-status {
    margin-top: var(--spacing-md);
  }

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

  .current-plan, .plans {
    margin-top: var(--spacing-xl);
  }

  .plans-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--spacing-md);
    margin-top: var(--spacing-md);
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

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  /* Profile Section */
  .profile-section {
    margin-top: var(--spacing-xl);
    padding-bottom: var(--spacing-xl);
    border-bottom: 1px solid var(--color-border);
  }

  /* Preferences Section */
  .preferences-section {
    margin-top: var(--spacing-xl);
    padding-bottom: var(--spacing-xl);
    border-bottom: 1px solid var(--color-border);
  }

  .preferences-form {
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    margin-top: var(--spacing-md);
  }

  .form-help {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin: 0;
    margin-top: var(--spacing-xs);
  }

  .checkbox-group {
    gap: var(--spacing-xs);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    font-weight: 400;
    font-size: 0.875rem;
  }

  .checkbox-label input {
    width: auto;
    cursor: pointer;
  }

  .profile-form {
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    margin-top: var(--spacing-md);
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

  .form-actions {
    padding-top: var(--spacing-md);
  }

  /* Responsive Design */
  @media (max-width: 1024px) {
    .plans-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .container {
      padding: var(--spacing-md);
    }

    .page-header {
      flex-direction: column;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) 0;
    }

    .back-link {
      font-size: 0.875rem;
    }

    .page-header h1 {
      font-size: 1.5rem;
      margin: 0;
    }

    .auth-status.logged-in {
      flex-direction: column;
    }

    .auth-status.logged-in .btn {
      width: 100%;
    }

    .auth-form {
      max-width: 100%;
    }

    .profile-form,
    .preferences-form {
      max-width: 100%;
    }

    .form-group {
      gap: var(--spacing-xs);
    }

    .form-group label {
      font-size: 0.8125rem;
    }

    .avatar-upload {
      gap: var(--spacing-md);
      flex-wrap: wrap;
    }

    .avatar-preview {
      width: 64px;
      height: 64px;
    }

    .avatar-placeholder {
      font-size: 1.5rem;
    }

    .instrument-grid {
      gap: var(--spacing-xs);
    }

    .instrument-chip {
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: 0.8125rem;
    }

    .plans-grid {
      grid-template-columns: 1fr;
    }

    .plan-card {
      padding: var(--spacing-md);
    }

    .plan-price {
      font-size: 1.125rem;
    }

    .features {
      font-size: 0.8125rem;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .profile-form,
    .preferences-form {
      gap: var(--spacing-md);
    }
  }

  @media (max-width: 480px) {
    .container {
      padding: var(--spacing-sm);
    }

    .page-header {
      gap: 0;
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--color-border);
    }

    .page-header h1 {
      font-size: 1.25rem;
      margin: var(--spacing-xs) 0 0;
    }

    .back-link {
      font-size: 0.75rem;
    }

    .profile-section,
    .preferences-section,
    .current-plan,
    .plans {
      margin-top: var(--spacing-md);
      padding-bottom: var(--spacing-md);
    }

    .profile-section h2,
    .preferences-section h2,
    .current-plan h2,
    .plans h2 {
      font-size: 1.125rem;
      margin: 0 0 var(--spacing-sm);
    }

    .form-group {
      gap: var(--spacing-xs);
    }

    .form-group label {
      font-size: 0.75rem;
      font-weight: 600;
    }

    .profile-form input,
    .profile-form select,
    .preferences-form input,
    .preferences-form select {
      padding: 8px 10px;
      font-size: 16px;
      border-radius: var(--radius-sm);
    }

    .avatar-upload {
      gap: var(--spacing-sm);
      flex-direction: column;
    }

    .avatar-preview {
      width: 56px;
      height: 56px;
    }

    .avatar-placeholder {
      font-size: 1.25rem;
    }

    .avatar-upload label.btn {
      width: 100%;
      text-align: center;
    }

    .instrument-grid {
      gap: 4px;
    }

    .instrument-chip {
      padding: 4px 8px;
      font-size: 0.75rem;
      flex: 1;
      text-align: center;
    }

    .form-actions {
      padding-top: var(--spacing-sm);
    }

    .form-actions .btn {
      width: 100%;
      padding: var(--spacing-sm);
    }

    .plan-card {
      padding: var(--spacing-sm);
    }

    .plan-name {
      font-size: 1rem;
    }

    .plan-desc {
      font-size: 0.8rem;
      margin: var(--spacing-xs) 0;
    }

    .plan-price {
      font-size: 1rem;
    }

    .features {
      font-size: 0.75rem;
      margin: var(--spacing-sm) 0;
    }

    .features li {
      padding: var(--spacing-xs) 0;
    }

    .current-badge {
      font-size: 0.65rem;
      padding: var(--spacing-xs) 4px;
    }

    .plans-grid {
      grid-template-columns: 1fr;
      gap: var(--spacing-sm);
    }

    .plan-card .btn {
      width: 100%;
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: 0.875rem;
      margin-top: var(--spacing-sm);
    }

    .form-help {
      font-size: 0.7rem;
      margin-top: 4px;
    }

    .checkbox-label {
      font-size: 0.8125rem;
      gap: var(--spacing-xs);
    }

    .error-message,
    .success-message {
      padding: var(--spacing-sm);
      margin-bottom: var(--spacing-sm);
      font-size: 0.875rem;
      border-radius: var(--radius-sm);
    }

    .loading {
      padding: var(--spacing-md);
      font-size: 0.875rem;
    }
  }
</style>
