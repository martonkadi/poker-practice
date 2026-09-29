"""Independent PokerKit 0.7.6 checks for adapter rule fixtures.

PokerKit's seat 1 is the small blind/button for a heads-up hand here.
The TypeScript engine fixtures use hero=seat 1 for these comparisons.
"""

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
