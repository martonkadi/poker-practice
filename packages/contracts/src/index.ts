import { z } from 'zod';

export const cardSchema = z.number().int().min(0).max(51);
export type Card = z.infer<typeof cardSchema>;
export const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fold') }),
  z.object({ kind: z.literal('check') }),
  z.object({ kind: z.literal('call') }),
  z.object({ kind: z.literal('raiseTo'), amount: z.number().int().nonnegative() })
]);
export type Action = z.infer<typeof actionSchema>;
export type Actor = 'hero' | 'bot';
export type Difficulty = 'easy' | 'standard';
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'settled';
export interface LegalActionSet {
  fold: boolean;
  check: boolean;
  call: number | null;
  raise: { min: number; max: number } | null;
  allInTo: number | null;
}
export interface PublicAction { actor: Actor; street: Street; action: Action; amount: number }
export interface PlayerObservation {
  handId: string;
  sequence: number;
  actor: Actor;
  hole: [Card, Card];
  board: Card[];
  street: Street;
  button: Actor;
  pot: number;
  stacks: Record<Actor, number>;
  commitments: Record<Actor, number>;
  history: PublicAction[];
  legal: LegalActionSet;
  highestBet: number;
}
export interface TableFrame {
  street: Street;
  board: Card[];
  pot: number;
  stacks: Record<Actor, number>;
  commitments: Record<Actor, number>;
  actor: Actor | null;
  legal: LegalActionSet | null;
}
export interface DecisionRecord {
  frame: TableFrame;
  action: Action;
  amount: number;
  heroHole: [Card, Card];
}
export interface HandRecord {
  schemaVersion: 1;
  engineVersion: string;
  botVersion: 'easy-v1' | 'standard-v1';
  id: string;
  sessionId: string;
  sessionStartedAt: string;
  sequence: number;
  completedAt: string;
  button: Actor;
  difficulty: Difficulty;
  initialHeroHole: [Card, Card];
  botHole: [Card, Card] | null;
  finalBoard: Card[];
  decisions: DecisionRecord[];
  heroNet: number;
  reachedShowdown: boolean;
  heroWonShowdown: boolean;
  bookmarked: boolean;
}
export const handRecordSchema: z.ZodType<HandRecord> = z.object({
  schemaVersion: z.literal(1), engineVersion: z.string(), botVersion: z.enum(['easy-v1', 'standard-v1']),
  id: z.uuid(), sessionId: z.uuid(), sessionStartedAt: z.iso.datetime(), sequence: z.number().int().nonnegative(),
  completedAt: z.iso.datetime(), button: z.enum(['hero', 'bot']), difficulty: z.enum(['easy', 'standard']),
  initialHeroHole: z.tuple([cardSchema, cardSchema]), botHole: z.tuple([cardSchema, cardSchema]).nullable(),
  finalBoard: z.array(cardSchema).max(5),
  decisions: z.array(z.object({
    frame: z.object({
      street: z.enum(['preflop', 'flop', 'turn', 'river', 'settled']), board: z.array(cardSchema).max(5),
      pot: z.number().int().nonnegative(), stacks: z.record(z.enum(['hero', 'bot']), z.number().int().nonnegative()),
      commitments: z.record(z.enum(['hero', 'bot']), z.number().int().nonnegative()),
      actor: z.enum(['hero', 'bot']).nullable(),
      legal: z.object({ fold: z.boolean(), check: z.boolean(), call: z.number().nullable(),
        raise: z.object({ min: z.number(), max: z.number() }).nullable(), allInTo: z.number().nullable() }).nullable()
    }), action: actionSchema, amount: z.number().int().nonnegative(), heroHole: z.tuple([cardSchema, cardSchema])
  })).max(100),
  heroNet: z.number().int().min(-10_000).max(10_000), reachedShowdown: z.boolean(), heroWonShowdown: z.boolean(), bookmarked: z.boolean()
}).superRefine((record, ctx) => {
  const cards = [...record.initialHeroHole, ...(record.botHole ?? []), ...record.finalBoard];
  if (new Set(cards).size !== cards.length) ctx.addIssue({ code: 'custom', message: 'Duplicate cards in completed hand' });
  if (record.reachedShowdown && (record.botHole === null || record.finalBoard.length !== 5)) ctx.addIssue({ code: 'custom', message: 'Incomplete showdown' });
  if (!record.reachedShowdown && record.heroWonShowdown) ctx.addIssue({ code: 'custom', message: 'Invalid showdown result' });
  if (Date.parse(record.sessionStartedAt) > Date.parse(record.completedAt)) ctx.addIssue({ code: 'custom', message: 'Completion precedes session start' });
  for (const decision of record.decisions) {
    const visible = [...decision.heroHole, ...decision.frame.board];
    if (new Set(visible).size !== visible.length) ctx.addIssue({ code: 'custom', message: 'Duplicate visible cards at decision' });
  }
});

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
export function cardToText(card: Card): string { return `${RANKS[card % 13]}${SUITS[Math.floor(card / 13)]}`; }
export function textToCard(text: string): Card {
  const rank = RANKS.indexOf(text[0]?.toUpperCase() ?? '');
  const suit = SUITS.indexOf(text[1]?.toLowerCase() ?? '');
  if (text.length !== 2 || rank < 0 || suit < 0) throw new Error(`Invalid card ${text}`);
  return suit * 13 + rank;
}
