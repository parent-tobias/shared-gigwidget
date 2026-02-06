/**
 * Permissions service for subscription tier enforcement
 *
 * Tier capabilities:
 * - free: View songs only (read-only mode)
 * - basic: Edit songs and chords, save to cloud
 * - pro: All basic + create/host shared sessions
 * - mod: All pro + create system-default chords and instruments
 */

import { SUBSCRIPTION_TIERS, type SubscriptionTier, type User } from '../models/index.js';

// ============================================================================
// Permission Types
// ============================================================================

export type Permission =
  | 'view_songs'
  | 'edit_songs'
  | 'create_songs'
  | 'delete_songs'
  | 'edit_chords'
  | 'save_remotely'
  | 'create_sessions'
  | 'join_sessions'
  | 'create_system_chords'
  | 'create_system_instruments'
  | 'moderate_content';

// ============================================================================
// Tier Permission Mapping
// ============================================================================

const TIER_PERMISSIONS: Record<SubscriptionTier, Permission[]> = {
  free: [
    'view_songs',
    'join_sessions',
  ],
  basic: [
    'view_songs',
    'edit_songs',
    'create_songs',
    'delete_songs',
    'edit_chords',
    'save_remotely',
    'join_sessions',
  ],
  pro: [
    'view_songs',
    'edit_songs',
    'create_songs',
    'delete_songs',
    'edit_chords',
    'save_remotely',
    'create_sessions',
    'join_sessions',
  ],
  mod: [
    'view_songs',
    'edit_songs',
    'create_songs',
    'delete_songs',
    'edit_chords',
    'save_remotely',
    'create_sessions',
    'join_sessions',
    'create_system_chords',
    'create_system_instruments',
    'moderate_content',
  ],
};

// ============================================================================
// Permission Checking Functions
// ============================================================================

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: User | null, permission: Permission): boolean {
  if (!user) return false;

  // Check if subscription has expired
  if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
    // Expired subscription falls back to free tier
    return TIER_PERMISSIONS.free.includes(permission);
  }

  const tierPermissions = TIER_PERMISSIONS[user.subscriptionTier];
  return tierPermissions.includes(permission);
}

/**
 * Check if a user has all of the specified permissions
 */
export function hasAllPermissions(user: User | null, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(user, p));
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(user: User | null, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(user, p));
}

/**
 * Get all permissions for a user's current tier
 */
export function getUserPermissions(user: User | null): Permission[] {
  if (!user) return [];

  // Check if subscription has expired
  if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
    return [...TIER_PERMISSIONS.free];
  }

  return [...TIER_PERMISSIONS[user.subscriptionTier]];
}

/**
 * Get the effective subscription tier for a user (accounting for expiration)
 */
export function getEffectiveTier(user: User | null): SubscriptionTier {
  if (!user) return 'free';

  if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
    return 'free';
  }

  // Fallback to 'free' if subscriptionTier is undefined or invalid
  const tier = user.subscriptionTier;
  if (!tier || !SUBSCRIPTION_TIERS.includes(tier)) {
    return 'free';
  }

  return tier;
}

// ============================================================================
// Tier Information
// ============================================================================

export interface TierInfo {
  name: string;
  displayName: string;
  description: string;
  features: string[];
  price?: string;
}

export const TIER_INFO: Record<SubscriptionTier, TierInfo> = {
  free: {
    name: 'free',
    displayName: 'Free',
    description: 'View and browse songs',
    features: [
      'View all songs in your library',
      'Join shared sessions',
      'Basic chord viewing',
    ],
  },
  basic: {
    name: 'basic',
    displayName: 'Basic',
    description: 'Full editing capabilities',
    features: [
      'Everything in Free',
      'Create and edit songs',
      'Custom chord fingerings',
      'Cloud backup and sync',
    ],
    price: '$1.99/month',
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    description: 'Host sessions and collaborate',
    features: [
      'Everything in Basic',
      'Create and host shared sessions',
      'Real-time collaboration',
      'Session management tools',
    ],
    price: '$4.99/month',
  },
  mod: {
    name: 'mod',
    displayName: 'Moderator',
    description: 'Community contributor',
    features: [
      'Everything in Pro',
      'Create system-default chords',
      'Create system instruments',
      'Content moderation tools',
    ],
  },
};

/**
 * Get required tier for a specific permission
 */
export function getRequiredTierForPermission(permission: Permission): SubscriptionTier {
  for (const tier of ['free', 'basic', 'pro', 'mod'] as SubscriptionTier[]) {
    if (TIER_PERMISSIONS[tier].includes(permission)) {
      return tier;
    }
  }
  return 'mod'; // Highest tier if not found
}

/**
 * Check if user can upgrade to a higher tier
 */
export function canUpgrade(user: User | null): boolean {
  if (!user) return true;
  return user.subscriptionTier !== 'mod';
}

/**
 * Get the next tier for upgrade
 */
export function getNextTier(currentTier: SubscriptionTier): SubscriptionTier | null {
  const tiers: SubscriptionTier[] = ['free', 'basic', 'pro', 'mod'];
  const currentIndex = tiers.indexOf(currentTier);
  if (currentIndex < tiers.length - 1) {
    return tiers[currentIndex + 1];
  }
  return null;
}
