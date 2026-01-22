<script lang="ts">
  import { browser } from '$app/environment';
  import type { User, SubscriptionTier } from '@gigwidget/core';
  import { TIER_INFO, getEffectiveTier, getUserPermissions } from '@gigwidget/core';

  let user = $state<User | null>(null);
  let loading = $state(true);
  let hasLoaded = false;

  $effect(() => {
    if (!browser || hasLoaded) return;
    hasLoaded = true;
    loadUser();
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
</style>
