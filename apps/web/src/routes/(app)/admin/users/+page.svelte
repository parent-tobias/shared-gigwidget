<script lang="ts">
  import { browser } from '$app/environment';
  import { hasPermission, type User } from '@gigwidget/core';
  import {
    loadAllUsersAdmin,
    updateUserTierAdmin,
    deleteUserAdmin,
    type SupabaseProfile,
  } from '$lib/stores/supabaseStore';

  // Permission check
  let user = $state<User | null>(null);
  let canManageUsers = $derived(user && hasPermission(user, 'create_system_chords'));

  // Data state
  let users = $state<SupabaseProfile[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let totalCount = $state(0);

  // Pagination
  let currentPage = $state(1);
  let pageSize = 50;
  let totalPages = $derived(Math.ceil(totalCount / pageSize));

  // Search
  let searchQuery = $state('');
  let searchTimeout: ReturnType<typeof setTimeout>;

  // Edit tier state
  let editingUserId = $state<string | null>(null);
  let editingTier = $state<SupabaseProfile['subscription_tier']>('free');
  let savingTier = $state(false);

  // Delete state
  let deletingId = $state<string | null>(null);
  let showDeleteModal = $state(false);
  let userToDelete = $state<SupabaseProfile | null>(null);

  $effect(() => {
    if (browser) {
      loadUser();
      loadUsers();
    }
  });

  // Debounced search
  $effect(() => {
    if (browser && searchQuery !== undefined) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 1;
        loadUsers();
      }, 300);
    }
  });

  async function loadUser() {
    try {
      const { getDatabase } = await import('@gigwidget/db');
      const db = getDatabase();
      const dbUsers = await db.users.toArray();
      if (dbUsers.length > 0) {
        user = dbUsers[0];
      }
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  }

  async function loadUsers() {
    loading = true;
    error = null;

    try {
      const offset = (currentPage - 1) * pageSize;
      const result = await loadAllUsersAdmin({
        limit: pageSize,
        offset,
        search: searchQuery,
      });

      if (result.error) {
        error = 'Failed to load users. You may not have moderator access.';
        console.error(result.error);
        return;
      }

      users = result.data ?? [];
      totalCount = result.count ?? 0;
    } catch (err) {
      console.error('Exception loading users:', err);
      error = 'Failed to load users';
    } finally {
      loading = false;
    }
  }

  function handlePageChange(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      loadUsers();
    }
  }

  function startEditTier(profile: SupabaseProfile) {
    editingUserId = profile.id;
    editingTier = profile.subscription_tier;
  }

  function cancelEditTier() {
    editingUserId = null;
  }

  async function saveTier(userId: string) {
    savingTier = true;

    try {
      const result = await updateUserTierAdmin(userId, editingTier);

      if (result.error) {
        alert('Failed to update user tier');
        console.error(result.error);
        return;
      }

      // Update local state
      users = users.map((u) =>
        u.id === userId ? { ...u, subscription_tier: editingTier } : u
      );
      editingUserId = null;
    } catch (err) {
      console.error('Exception updating tier:', err);
      alert('Failed to update user tier');
    } finally {
      savingTier = false;
    }
  }

  function confirmDelete(profile: SupabaseProfile) {
    userToDelete = profile;
    showDeleteModal = true;
  }

  async function handleDelete() {
    if (!userToDelete) return;

    // Prevent deleting yourself
    if (userToDelete.id === user?.supabaseId) {
      alert('You cannot delete your own account from here.');
      showDeleteModal = false;
      userToDelete = null;
      return;
    }

    deletingId = userToDelete.id;

    try {
      const result = await deleteUserAdmin(userToDelete.id);

      if (result.error) {
        alert('Failed to delete user');
        console.error(result.error);
        return;
      }

      // Remove from list
      users = users.filter((u) => u.id !== userToDelete!.id);
      totalCount = Math.max(0, totalCount - 1);
      showDeleteModal = false;
      userToDelete = null;
    } catch (err) {
      console.error('Exception deleting user:', err);
      alert('Failed to delete user');
    } finally {
      deletingId = null;
    }
  }

  function cancelDelete() {
    showDeleteModal = false;
    userToDelete = null;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getTierBadgeClass(tier: string): string {
    switch (tier) {
      case 'mod':
        return 'badge-mod';
      case 'pro':
        return 'badge-pro';
      case 'basic':
        return 'badge-basic';
      default:
        return 'badge-free';
    }
  }

  function isCurrentUser(profile: SupabaseProfile): boolean {
    return profile.id === user?.supabaseId;
  }
</script>

<svelte:head>
  <title>User Management - Gigwidget</title>
</svelte:head>

<div class="admin-page">
  <div class="page-header">
    <h1>User Management</h1>
    <span class="mod-badge">Moderator Panel</span>
  </div>

  {#if !canManageUsers}
    <div class="permission-error">
      <h3>Access Denied</h3>
      <p>You do not have permission to access this page.</p>
      <p>This feature is only available to moderators.</p>
    </div>
  {:else}
    <div class="controls-bar">
      <div class="search-section">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search by display name..."
          class="search-input"
        />
      </div>
      <div class="stats">
        <span>Total Users: <strong>{totalCount}</strong></span>
      </div>
    </div>

    {#if loading}
      <div class="loading">Loading users...</div>
    {:else if error}
      <div class="error-message">{error}</div>
    {:else if users.length === 0}
      <div class="no-users">
        {#if searchQuery}
          <p>No users found matching "{searchQuery}"</p>
        {:else}
          <p>No users in the database.</p>
        {/if}
      </div>
    {:else}
      <div class="users-table-container">
        <table class="users-table">
          <thead>
            <tr>
              <th>Display Name</th>
              <th>User ID</th>
              <th>Tier</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each users as profile (profile.id)}
              <tr class:current-user={isCurrentUser(profile)}>
                <td class="user-name">
                  {profile.display_name}
                  {#if isCurrentUser(profile)}
                    <span class="you-badge">You</span>
                  {/if}
                </td>
                <td class="user-id" title={profile.id}>
                  {profile.id.substring(0, 8)}...
                </td>
                <td>
                  {#if editingUserId === profile.id}
                    <div class="tier-edit">
                      <select bind:value={editingTier} class="tier-select">
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="pro">Pro</option>
                        <option value="mod">Moderator</option>
                      </select>
                      <button
                        type="button"
                        class="btn btn-xs btn-primary"
                        onclick={() => saveTier(profile.id)}
                        disabled={savingTier}
                      >
                        {savingTier ? '...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        class="btn btn-xs btn-secondary"
                        onclick={cancelEditTier}
                        disabled={savingTier}
                      >
                        Cancel
                      </button>
                    </div>
                  {:else}
                    <span class="tier-badge {getTierBadgeClass(profile.subscription_tier)}">
                      {profile.subscription_tier}
                    </span>
                  {/if}
                </td>
                <td>{formatDate(profile.created_at)}</td>
                <td>{formatDate(profile.updated_at)}</td>
                <td class="actions-cell">
                  {#if editingUserId !== profile.id}
                    <button
                      type="button"
                      class="btn btn-sm btn-secondary"
                      onclick={() => startEditTier(profile)}
                    >
                      Edit Tier
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-danger"
                      onclick={() => confirmDelete(profile)}
                      disabled={deletingId === profile.id || isCurrentUser(profile)}
                      title={isCurrentUser(profile) ? 'Cannot delete your own account' : ''}
                    >
                      {deletingId === profile.id ? 'Deleting...' : 'Delete'}
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if totalPages > 1}
        <div class="pagination">
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            onclick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span class="page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            onclick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      {/if}

      <div class="summary">
        Showing {users.length} of {totalCount} user{totalCount !== 1 ? 's' : ''}
        {#if searchQuery}
          matching "{searchQuery}"
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Delete confirmation modal -->
{#if showDeleteModal && userToDelete}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={cancelDelete}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>Delete User Account?</h2>
      <p class="modal-message">
        Are you sure you want to delete the account for "<strong>{userToDelete.display_name}</strong>"?
      </p>
      <p class="warning-text">
        This will permanently delete the user's profile, all their songs, collections,
        custom instruments, and preferences. This action cannot be undone.
      </p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick={cancelDelete}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-danger"
          onclick={handleDelete}
          disabled={deletingId !== null}
        >
          {deletingId ? 'Deleting...' : 'Delete Account'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .admin-page {
    padding: var(--spacing-lg);
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-xl);
    padding-bottom: var(--spacing-md);
    border-bottom: 2px solid var(--color-border);
  }

  .page-header h1 {
    margin: 0;
    font-size: 1.75rem;
  }

  .mod-badge {
    background-color: #4caf50;
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .permission-error {
    padding: var(--spacing-xl);
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .permission-error h3 {
    margin: 0 0 var(--spacing-sm) 0;
    color: var(--color-primary);
  }

  .controls-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
    padding: var(--spacing-md);
    background-color: var(--color-surface);
    border-radius: var(--radius-md);
  }

  .search-section {
    flex: 1;
    max-width: 400px;
  }

  .search-input {
    width: 100%;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    font-family: inherit;
  }

  .stats {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .loading {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .error-message {
    background-color: rgba(233, 69, 96, 0.1);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-sm);
    padding: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
    color: var(--color-primary);
    text-align: center;
  }

  .no-users {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);
  }

  .users-table-container {
    overflow-x: auto;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    background-color: var(--color-surface);
  }

  .users-table thead {
    background-color: var(--color-bg-secondary);
    border-bottom: 2px solid var(--color-border);
  }

  .users-table th {
    padding: var(--spacing-sm) var(--spacing-md);
    text-align: left;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .users-table td {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  .users-table tbody tr:last-child td {
    border-bottom: none;
  }

  .users-table tbody tr:hover {
    background-color: var(--color-bg-secondary);
  }

  .users-table tbody tr.current-user {
    background-color: rgba(76, 175, 80, 0.05);
  }

  .user-name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .you-badge {
    font-size: 0.6875rem;
    font-weight: 600;
    background-color: var(--color-primary);
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .user-id {
    font-family: monospace;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .tier-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-free {
    background-color: rgba(158, 158, 158, 0.2);
    color: #9e9e9e;
  }

  .badge-basic {
    background-color: rgba(33, 150, 243, 0.2);
    color: #2196f3;
  }

  .badge-pro {
    background-color: rgba(156, 39, 176, 0.2);
    color: #9c27b0;
  }

  .badge-mod {
    background-color: rgba(76, 175, 80, 0.2);
    color: #4caf50;
  }

  .tier-edit {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .tier-select {
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg);
    font-size: 0.8125rem;
  }

  .actions-cell {
    display: flex;
    gap: var(--spacing-xs);
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-md);
    margin-top: var(--spacing-lg);
    padding: var(--spacing-md);
  }

  .page-info {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .summary {
    margin-top: var(--spacing-md);
    padding: var(--spacing-sm);
    text-align: center;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .btn-xs {
    padding: 2px 6px;
    font-size: 0.75rem;
  }

  .btn-sm {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.875rem;
  }

  .btn-danger {
    background-color: #dc3545;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background-color: #c82333;
  }

  .btn-danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--spacing-md);
  }

  .modal {
    background-color: var(--color-bg);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    max-width: 450px;
    width: 100%;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .modal h2 {
    margin: 0 0 var(--spacing-sm) 0;
    font-size: 1.25rem;
  }

  .modal-message {
    color: var(--color-text);
    font-size: 0.9375rem;
    margin-bottom: var(--spacing-sm);
  }

  .warning-text {
    color: #dc3545;
    font-size: 0.875rem;
    margin-bottom: var(--spacing-lg);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
  }

  @media (max-width: 768px) {
    .controls-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .search-section {
      max-width: none;
    }

    .users-table {
      font-size: 0.875rem;
    }

    .users-table th,
    .users-table td {
      padding: var(--spacing-xs) var(--spacing-sm);
    }

    .actions-cell {
      flex-direction: column;
    }
  }
</style>
