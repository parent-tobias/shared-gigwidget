<script lang="ts">
  import { browser } from '$app/environment';
  import type { User, SubscriptionTier, Instrument } from '@gigwidget/core';
  import { TIER_INFO, getEffectiveTier, getUserPermissions, INSTRUMENTS } from '@gigwidget/core';

  let user = $state<User | null>(null);
  let loading = $state(true);
  let hasLoaded = false;

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
    loadUser();
  });

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
        instruments: editInstruments,
      };

      if (avatarFile) {
        updates.avatar = avatarFile;
      }

      await db.users.update(user.id, updates);
      user = { ...user, ...updates };
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
</style>
