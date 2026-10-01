import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { LegalActionSet } from '@poker/contracts';
import { controlsFor, isBusy, playReducer, type Phase, type PlayEvent, type SaveOp } from './playMachine';

// Small pools so generated events often collide: the same ids/tokens get reused (duplicates),
// arrive after their request ended (stale) or before it started (out of order).
const ids = ['r1', 'r2', 'r3'] as const;
const sessions = [{}, {}];
const arbId = fc.constantFrom(...ids);
const arbToken = fc.integer({ min: 0, max: 3 });
const arbOp = fc.constantFrom<SaveOp>('hero', 'bot', 'deal', 'end');

const arbEvent: fc.Arbitrary<PlayEvent> = fc.oneof(
  fc.record({ type: fc.constant('SAVE_STARTED' as const), op: arbOp, token: arbToken }),
  fc.record({ type: fc.constant('SAVE_OK' as const), token: arbToken }),
  fc.record({ type: fc.constant('SAVE_FAILED' as const), token: arbToken, message: fc.constant('save failed') }),
  fc.record({ type: fc.constant('BOT_REQUESTED' as const), requestId: arbId, sessionRef: fc.constantFrom(...sessions) }),
  fc.record({ type: fc.constant('BOT_DECIDED' as const), requestId: arbId, stale: fc.boolean(), token: arbToken }),
  fc.record({ type: fc.constant('BOT_CANCELLED' as const), requestId: arbId }),
  fc.record({ type: fc.constant('BOT_FAILED' as const), requestId: arbId, message: fc.constant('bot failed') }),
  fc.constant<PlayEvent>({ type: 'RETRY' }),
  fc.constant<PlayEvent>({ type: 'DISMISS' }),
);

/** Identity of the outstanding request or save a busy phase is waiting on. */
const busyKey = (p: Phase): string | null =>
  p.kind === 'saving' ? `save:${p.token}` : p.kind === 'botThinking' ? `bot:${p.requestId}` : null;

/** Key of the request/save an event starts, if any. */
const startedKey = (e: PlayEvent): string | null =>
  e.type === 'SAVE_STARTED' ? `save:${e.token}`
    : e.type === 'BOT_REQUESTED' ? `bot:${e.requestId}`
      : e.type === 'BOT_DECIDED' && !e.stale ? `save:${e.token}`
        : null;

/** Key of the request/save an event terminates, if any. */
const terminatedKey = (e: PlayEvent): string | null =>
  e.type === 'SAVE_OK' || e.type === 'SAVE_FAILED' ? `save:${e.token}`
    : e.type === 'BOT_DECIDED' || e.type === 'BOT_CANCELLED' || e.type === 'BOT_FAILED' ? `bot:${e.requestId}`
      : null;

/** Applies one event and checks the per-step liveness invariants. */
function step(prev: Phase, event: PlayEvent): Phase {
  const next = playReducer(prev, event);
  const before = busyKey(prev), after = busyKey(next);
  const ended = terminatedKey(event);

  // Busy is only entered through an event that starts exactly that request/save.
  if (after !== null && after !== before) expect(startedKey(event)).toBe(after);
  // A busy phase survives only events that are not its terminal event.
  if (after !== null && after === before) expect(ended).not.toBe(before);
  // The terminal event for the outstanding item always releases it.
  if (before !== null && ended === before) expect(after).not.toBe(before);
  // Busy-to-busy only via an accepted bot decision handing over to its save.
  if (before !== null && after !== null && after !== before) {
    expect(event.type).toBe('BOT_DECIDED');
    expect(ended).toBe(before);
  }
  // Ids/tokens that do not match the outstanding item are no-ops.
  if (before !== null && ended !== null && ended !== before) expect(next).toBe(prev);
  // Cancellation and stale decisions never produce an error phase.
  if (event.type === 'BOT_CANCELLED' || (event.type === 'BOT_DECIDED' && event.stale)) {
    expect(next === prev || next.kind === 'idle').toBe(true);
  }
  return next;
}

/** Terminal event for whatever the busy phase is waiting on; `choice` picks among valid outcomes. */
function terminalFor(p: Phase, choice: number, token: number): PlayEvent {
  if (p.kind === 'saving') {
    return choice % 2 ? { type: 'SAVE_OK', token: p.token } : { type: 'SAVE_FAILED', token: p.token, message: 'x' };
  }
  if (p.kind !== 'botThinking') throw new Error('not busy');
  const requestId = p.requestId;
  switch (choice % 4) {
    case 0: return { type: 'BOT_DECIDED', requestId, stale: false, token };
    case 1: return { type: 'BOT_DECIDED', requestId, stale: true, token };
    case 2: return { type: 'BOT_CANCELLED', requestId };
    default: return { type: 'BOT_FAILED', requestId, message: 'x' };
  }
}

describe('playReducer', () => {
  // Feature: guest-mvp-release, Property 1: Busy-state liveness
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.6**
  it('is busy only while a started request or save awaits its terminal event', () => {
    fc.assert(
      fc.property(
        fc.array(arbEvent, { maxLength: 60 }),
        fc.array(fc.nat(), { minLength: 2, maxLength: 2 }),
        arbToken,
        (events, choices, token) => {
          let phase: Phase = { kind: 'idle' };
          for (const event of events) phase = step(phase, event);

          // Deliver the terminal event of every outstanding item; at most a bot request then its save.
          for (const choice of choices) {
            if (!isBusy(phase)) break;
            phase = step(phase, terminalFor(phase, choice, token));
          }
          if (isBusy(phase)) phase = step(phase, terminalFor(phase, 1, token));
          expect(isBusy(phase)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

const arbPhase: fc.Arbitrary<Phase> = fc.oneof(
  fc.constant<Phase>({ kind: 'idle' }),
  fc.record({ kind: fc.constant('saving' as const), op: arbOp, token: arbToken }),
  fc.record({ kind: fc.constant('botThinking' as const), requestId: arbId, sessionRef: fc.constantFrom(...sessions) }),
  fc.record({ kind: fc.constant('botFailed' as const), message: fc.constant('bot failed') }),
  fc.record({ kind: fc.constant('saveFailed' as const), message: fc.constant('save failed') }),
);

const arbChips = fc.integer({ min: 1, max: 10_000 });
const arbLegal: fc.Arbitrary<LegalActionSet | null> = fc.option(
  fc.record({
    fold: fc.boolean(),
    check: fc.boolean(),
    call: fc.option(arbChips),
    raise: fc.option(fc.record({ min: arbChips, max: arbChips })),
    allInTo: fc.option(arbChips),
  }),
);

describe('controlsFor', () => {
  // Feature: guest-mvp-release, Property 2: Busy rejects input and controls follow legality
  // **Validates: Requirements 2.7, 2.8**
  it('enables nothing while busy and exactly the legal controls otherwise', () => {
    fc.assert(
      fc.property(arbPhase, arbLegal, arbToken, (phase, legal, token) => {
        const busy = isBusy(phase);
        const controls = controlsFor(legal, busy);

        if (busy || legal === null) {
          expect(controls).toEqual({ fold: false, checkOrCall: false, raise: false, allIn: false });
        } else {
          expect(controls).toEqual({
            fold: legal.fold,
            checkOrCall: legal.check || legal.call !== null,
            raise: legal.raise !== null,
            allIn: legal.allInTo !== null,
          });
        }

        // A hero action submitted while busy is a no-op on the phase.
        if (busy) expect(playReducer(phase, { type: 'SAVE_STARTED', op: 'hero', token })).toBe(phase);
      }),
      { numRuns: 200 },
    );
  });
});
