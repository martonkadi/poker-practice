import type { Action, HandRecord } from '@poker/contracts';
import type { ActiveSession } from '@poker/persistence';
import { GUEST_OWNER, saveActive, saveCompleted } from '@poker/persistence';
import { ENGINE_PATCH_VERSION, applyAction, board, createHand, frame, handIdentity, hole, isSettled, recordedAction, result } from '@poker/poker';

export async function dealNext(previous: ActiveSession | null): Promise<ActiveSession> {
  if (previous && !isSettled(previous.state)) throw new Error('Finish the current hand first.');
  const nextSequence = previous ? previous.nextSequence + 1 : 0;
  const state = await createHand(previous ? handIdentity(previous.state).button === 'hero' ? 'bot' : 'hero' : 'hero');
  const next: ActiveSession = { id: previous?.id ?? crypto.randomUUID(), owner: GUEST_OWNER, state,
    difficulty: 'standard', nextSequence, decisions: [], startedAt: previous?.startedAt ?? new Date().toISOString() };
  await saveActive(next);
  return next;
}

export async function actAndSave(active: ActiveSession, action: Action): Promise<ActiveSession> {
  const before = frame(active.state);
  if (!before.actor || isSettled(active.state)) throw new Error('This hand is complete.');
  const state = await applyAction(active.state, before.actor, action);
  // Throws RecordError ("This action could not be recorded.") before any write, so nothing is saved.
  const recorded = recordedAction(active.state, state, before.actor);
  // The frame stays frame(before): a street-closing call carries the street it closed.
  const decisions = [...active.decisions, { frame: before, action: recorded.action, amount: recorded.amount, heroHole: hole(active.state, 'hero') }];
  const identity = handIdentity(state);
  const next: ActiveSession = { ...active, state, decisions, recordedHandId: isSettled(state) ? identity.id : undefined };
  if (isSettled(state)) {
    const outcome = result(state);
    const record: HandRecord = {
      schemaVersion: 1, engineVersion: ENGINE_PATCH_VERSION, botVersion: active.difficulty === 'easy' ? 'easy-v1' : 'standard-v1',
      id: identity.id, sessionId: active.id, sessionStartedAt: active.startedAt, sequence: active.nextSequence,
      completedAt: new Date().toISOString(), button: identity.button, difficulty: active.difficulty,
      initialHeroHole: hole(state, 'hero'), botHole: outcome.showdown ? hole(state, 'bot') : null,
      finalBoard: board(state), decisions, heroNet: outcome.heroNet, reachedShowdown: outcome.showdown,
      heroWonShowdown: outcome.heroWonShowdown, bookmarked: false
    };
    await saveCompleted(GUEST_OWNER, record, next);
  } else await saveActive(next);
  return next;
}
