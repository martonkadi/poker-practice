import type { LegalActionSet } from '@poker/contracts';

/** Which kind of write a `saving` phase is waiting on. */
export type SaveOp = 'hero' | 'bot' | 'deal' | 'end';

export type Phase =
  | { kind: 'idle' }
  | { kind: 'saving'; op: SaveOp; token: number }
  | { kind: 'botThinking'; requestId: string; sessionRef: object }
  | { kind: 'botFailed'; message: string }
  | { kind: 'saveFailed'; message: string };

export type PlayEvent =
  | { type: 'SAVE_STARTED'; op: SaveOp; token: number }
  | { type: 'SAVE_OK'; token: number }
  | { type: 'SAVE_FAILED'; token: number; message: string }
  | { type: 'BOT_REQUESTED'; requestId: string; sessionRef: object }
  | { type: 'BOT_DECIDED'; requestId: string; stale: boolean; token: number }
  | { type: 'BOT_CANCELLED'; requestId: string }
  | { type: 'BOT_FAILED'; requestId: string; message: string }
  | { type: 'RETRY' }
  | { type: 'DISMISS' };

const IDLE: Phase = { kind: 'idle' };

/**
 * Pure transition function for the play controller.
 * Any event whose `requestId` or `token` does not match the current phase, or that is
 * not valid from the current phase, returns the same phase object (a no-op).
 */
export function playReducer(phase: Phase, event: PlayEvent): Phase {
  switch (event.type) {
    case 'SAVE_STARTED':
      // botFailed: the hero cannot act, so the only write allowed is ending the hand.
      if (phase.kind === 'idle' || phase.kind === 'saveFailed' || (phase.kind === 'botFailed' && event.op === 'end')) {
        return { kind: 'saving', op: event.op, token: event.token };
      }
      return phase;
    case 'SAVE_OK':
      return phase.kind === 'saving' && phase.token === event.token ? IDLE : phase;
    case 'SAVE_FAILED':
      return phase.kind === 'saving' && phase.token === event.token ? { kind: 'saveFailed', message: event.message } : phase;
    case 'BOT_REQUESTED':
      return phase.kind === 'idle' ? { kind: 'botThinking', requestId: event.requestId, sessionRef: event.sessionRef } : phase;
    case 'BOT_DECIDED':
      if (phase.kind !== 'botThinking' || phase.requestId !== event.requestId) return phase;
      // Stale decisions are discarded without an error; accepted ones stay busy until saved.
      return event.stale ? IDLE : { kind: 'saving', op: 'bot', token: event.token };
    case 'BOT_CANCELLED':
      // Cancellation clears busy silently.
      return phase.kind === 'botThinking' && phase.requestId === event.requestId ? IDLE : phase;
    case 'BOT_FAILED':
      return phase.kind === 'botThinking' && phase.requestId === event.requestId ? { kind: 'botFailed', message: event.message } : phase;
    case 'RETRY':
      // Back to idle so the bot effect sends one new request for the unchanged session.
      return phase.kind === 'botFailed' ? IDLE : phase;
    case 'DISMISS':
      // Dismissing a bot failure would silently retry, so only save failures can be dismissed.
      return phase.kind === 'saveFailed' ? IDLE : phase;
  }
}

export const isBusy = (p: Phase): boolean => p.kind === 'saving' || p.kind === 'botThinking';

export interface Controls {
  fold: boolean;
  checkOrCall: boolean;
  raise: boolean;
  allIn: boolean;
}

/** Pure enablement map used by Play; buttons and keyboard shortcuts both consult it. */
export function controlsFor(legal: LegalActionSet | null, busy: boolean): Controls {
  if (busy || !legal) return { fold: false, checkOrCall: false, raise: false, allIn: false };
  return {
    fold: legal.fold,
    checkOrCall: legal.check || legal.call !== null,
    raise: legal.raise !== null,
    allIn: legal.allInTo !== null,
  };
}
