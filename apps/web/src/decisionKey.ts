import type { ActiveSession } from '@poker/persistence';
import { handIdentity } from '@poker/poker';

/**
 * Stable identifier of the current decision point: same session, same hand and the same
 * number of engine events. Re-reading the same saved state (e.g. after acquiring the
 * session lock) yields a new object but the same key, so UI state such as a typed raise
 * amount is only reset when the hand or decision actually changes.
 */
export function decisionKey(session: ActiveSession | null): string | null {
  if (!session) return null;
  const identity = handIdentity(session.state);
  return `${session.id}:${identity.id}:${identity.sequence}`;
}
