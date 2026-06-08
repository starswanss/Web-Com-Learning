import { invalidatePrefix } from '@/lib/server-cache';

/**
 * Clear every cached leaderboard / ranking variant. Call after any write that
 * changes scores, bonus points, submission counts, or xp (grading, bonus,
 * submitting, quest claims) so the next view recomputes fresh data even while
 * the long TTL is still running.
 *
 * Covers the three cache key families:
 *   - student score board   →  leaderboard:{class}:{subject}
 *   - teacher score board   →  teacher-leaderboard:{uid}:{subject}:{class}
 *   - teacher level board   →  level-ranking:{uid}:{subject}
 */
export function invalidateLeaderboards(): void {
  invalidatePrefix('leaderboard:');
  invalidatePrefix('teacher-leaderboard:');
  invalidatePrefix('level-ranking:');
}
