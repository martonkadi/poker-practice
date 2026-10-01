"""Independent PokerKit 0.7.6 checks for adapter rule fixtures.

PokerKit's seat 1 is the small blind/button for a heads-up hand here.
The TypeScript engine fixtures use hero=seat 1 for these comparisons.
"""

import json
import sys
from pathlib import Path

from pokerkit import Automation, NoLimitTexasHoldem


def game():
    return NoLimitTexasHoldem.create_state(
        tuple(Automation), True, 0, (50, 100), 100, (10_000, 10_000), 2
    )


s = game()
assert s.actor_index == 1
assert s.stacks == [9900, 9950]
assert s.bets == [100, 50]
assert s.min_completion_betting_or_raising_to_amount == 200
s.check_or_call()
assert s.actor_index == 0
assert s.stacks == [9900, 9900]
assert s.bets == [100, 100]
s.check_or_call()
assert s.street_index == 1 and s.actor_index == 0

s = game()
s.fold()
assert not s.status and s.stacks == [10050, 9950]

s = game()
s.complete_bet_or_raise_to(10_000)
assert s.actor_index == 0 and s.bets == [100, 10_000]
s.check_or_call()
assert not s.status and sum(s.stacks) == 20_000 and len(s.board_cards) == 5

manual_settlement = tuple(
    step for step in Automation if step not in (
        Automation.HAND_KILLING, Automation.CHIPS_PUSHING, Automation.CHIPS_PULLING
    )
)
s = NoLimitTexasHoldem.create_state(
    manual_settlement, True, 0, (1, 2), 2, (101, 201, 201), 3
)
assert s.actor_index == 2
s.complete_bet_or_raise_to(201)
s.check_or_call()
s.check_or_call()
assert [(pot.amount, pot.player_indices) for pot in s.pots] == [
    (303, (0, 1, 2)), (200, (1, 2))
]
assert sum(pot.amount for pot in s.pots) == 503

print("PokerKit reference: blind order, limp, minimum raise, fold, all-in and multiway side pots passed")


# Shared fixed-deck rules fixtures (Req 3.10), also asserted by
# packages/poker/src/rules-fixtures.test.ts. PokerKit is driven with each
# expected Canonical_Action; it must accept it, agree on actor and street,
# label it the same way (check/call/raiseTo by chips) and add the same chips.
FIXTURES = Path(__file__).resolve().parents[2] / "packages" / "poker" / "fixtures" / "rules-regression.json"
STREETS = ("preflop", "flop", "turn", "river")
MANUAL_DEALING = tuple(
    step for step in Automation if step not in (
        Automation.CARD_BURNING, Automation.HOLE_DEALING, Automation.BOARD_DEALING
    )
)


def deal_pending(s, holes, board):
    while True:
        if s.can_burn_card():
            s.burn_card("??")
        elif s.can_deal_hole():
            s.deal_hole(holes[s.hole_dealee_index].pop(0))
        elif s.can_deal_board():
            count = s.street.board_dealing_count
            s.deal_board("".join(board[:count]))
            del board[:count]
        else:
            return


def run_fixture(fx, small_blind, big_blind):
    errors = []
    # Seat 0 is the non-button big blind; seat 1 is the button/small blind.
    seats = (("bot" if fx["button"] == "hero" else "hero"), fx["button"])
    index = {name: i for i, name in enumerate(seats)}
    s = NoLimitTexasHoldem.create_state(
        MANUAL_DEALING, True, 0, (small_blind, big_blind), big_blind,
        tuple(fx["stacks"][name] for name in seats), 2
    )
    holes = [list(fx["hole"][name]) for name in seats]
    board = list(fx["board"])
    deal_pending(s, holes, board)
    for n, d in enumerate(fx["decisions"], 1):
        where = f"{fx['name']} decision {n}"
        if s.actor_index != index[d["actor"]]:
            errors.append(f"{where}: actor {s.actor_index} != {d['actor']}")
            break
        if STREETS[s.street_index] != d["street"]:
            errors.append(f"{where}: street {STREETS[s.street_index]} != {d['street']}")
        actor = s.actor_index
        outstanding = max(s.bets) - s.bets[actor]
        if "outstanding" in d and outstanding != d["outstanding"]:
            errors.append(f"{where}: outstanding {outstanding} != {d['outstanding']}")
        before_stack = s.stacks[actor]
        kind = d["action"]["kind"]
        if kind == "fold":
            s.fold()
            added, label = 0, {"kind": "fold"}
        elif kind in ("check", "call"):
            added = s.checking_or_calling_amount
            s.check_or_call()
            label = {"kind": "check" if added == 0 else "call"}
        else:
            target = d["action"]["amount"]
            highest = max(s.bets)
            added = target - s.bets[actor]
            s.complete_bet_or_raise_to(target)
            label = {"kind": "raiseTo", "amount": target} if target > highest else {"kind": "call"}
        if before_stack - added < 0:
            errors.append(f"{where}: added {added} exceeds stack {before_stack}")
        if label != d["action"] or added != d["amount"]:
            errors.append(f"{where}: PokerKit {label} {added} != fixture {d['action']} {d['amount']}")
        deal_pending(s, holes, board)
    if s.status:
        errors.append(f"{fx['name']}: hand still live after fixture decisions")
    dealt = [repr(card) for card in s.get_board_cards(0)]
    if dealt != fx["final"]["board"]:
        errors.append(f"{fx['name']}: board {dealt} != {fx['final']['board']}")
    stacks = {name: s.stacks[i] for name, i in index.items()}
    if stacks != fx["final"]["stacks"]:
        errors.append(f"{fx['name']}: stacks {stacks} != {fx['final']['stacks']}")
    return errors


spec = json.loads(FIXTURES.read_text(encoding="utf-8"))
mismatches = []
for fixture in spec["fixtures"]:
    mismatches += run_fixture(fixture, spec["smallBlind"], spec["bigBlind"])
for line in mismatches:
    print("MISMATCH", line)
print(f"PokerKit reference: {len(spec['fixtures'])} rules fixtures compared, {len(mismatches)} mismatches")
sys.exit(1 if mismatches else 0)
