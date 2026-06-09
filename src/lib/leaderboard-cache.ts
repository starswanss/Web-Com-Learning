import { invalidatePrefix } from '@/lib/server-cache';

/**
 * Clear every cached view that is derived from submissions / scores / xp /
 * bonus points. Call after any write that changes those (grading, bonus,
 * submitting, quest claims, member xp edits) so the next view recomputes fresh
 * data even while the long TTL is still running.
 *
 * Cache key families cleared:
 *   leaderboards →  leaderboard: / teacher-leaderboard: / level-ranking:
 *   teacher stats → submission-stats: / gradebook: / overview: / students:
 *                   analytics: / members:
 *
 * (Name kept for its existing call sites; it now clears all derived stats.)
 */
export function invalidateLeaderboards(): void {
  // Leaderboards / rankings
  invalidatePrefix('leaderboard:');
  invalidatePrefix('teacher-leaderboard:');
  invalidatePrefix('level-ranking:');
  // Teacher stat pages (scan submissions / users)
  invalidatePrefix('submission-stats:');
  invalidatePrefix('gradebook:');
  invalidatePrefix('overview:');
  invalidatePrefix('students:');
  invalidatePrefix('analytics:');
  invalidatePrefix('members:');
}
