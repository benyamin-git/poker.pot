# Betting rules

> **Heads up:** poker.pot does **not** implement standard poker betting rules.
> It runs a custom, simplified house ruleset made up by me and my friends — no
> blinds, no forced bets, no turn order, and a manual winner pick at the end.
> If you want a more standard version (blinds, proper no-limit betting, hand
> evaluation, etc.), you are very welcome to fork this project and build it.
> The [LICENSE](LICENSE) is literally "do whatever you want".

This app keeps a ledger, not a stack of physical chips. There are no cards and
no hand ranking — the group watches the real table and uses poker.pot only to
record who put in what and who won.

## The setup

- Every session starts with every player at **zero** chips. Balances are a
  running ledger and may go negative; nobody "buys in".
- Two limits come from `config.yaml`:
  - **`minRaise`** — a raise must beat the current bet of the round by at
    least this much.
  - **`maxBet`** — cumulative chips a player may put in across the whole
    match. Reaching it is an **all-in**.
- There are no blinds and no ante. The only pressure to bet preflop is
  `minRaise`: you cannot check preflop, so the first player must either fold or
  open with a raise.

## The betting rounds

A match can have many rounds. The app does **not** decide whose turn it is;
the phone is passed around and each player taps their own name to record an
action. The current round closes when every player still active has acted and
matched the round's highest bet.

### Preflop (round 1)

- You may **fold** or **raise**.
- **Check is not allowed.** The first player to act cannot check; they must
  open with a raise of at least `minRaise` or fold.
- Once a player has opened, anyone behind can **call** (match the current bet),
  **raise** again, or **fold**.

### Later rounds

- With no bet on the table you may **check** or **raise** (or fold).
- Once there is a bet you may **fold**, **call** (match the round's highest
  bet), or **raise** (beat it by at least `minRaise`).
- Checking is rejected while there is a bet to call.

### Raises

- A raise amount is the **additional chips** the player pushes in for that
  action.
- A legal raise must bring that player's total for the round up to at least
  `roundHigh + minRaise`.
- **A raise reopens the action.** Anyone who already acted in the round and is
  now behind gets to act again, so the round is not complete until every active
  player has matched the highest bet.

## Folding and all-in

- **Folding is final for the match.** A folded player takes no further part and
  cannot win.
- You cannot fold when you are the **last player still in** — the app blocks it.
- If everyone else folds, the last player standing wins automatically and the
  match ends immediately.
- Bumping into `maxBet` makes a player **all-in**. They sit out the rest of the
  match (no further actions) but their chips stay in the pot and they can still
  win.
- If an intended call or raise would push a player past `maxBet`, the app
  clamps the amount to the remaining headroom and records it as a short
  all-in. It is not treated as an illegal undersized raise.

## Choosing winners and paying out

- When betting is done, the group picks the winner(s) from the players who have
  **not folded**. Winners do not have to be all-in, and the app never decides
  this for you — watch the table, then tap.
- The **pot** is the total of every chip added by every action.
- The pot is split **equally** between the chosen winners.
- If the pot does not divide evenly, the leftover chips are handed out one
  apiece to random winners. The random assignment is seeded and stored, so the
  result never changes when history is replayed or edited.
- Chip counts are always integers.

## Editing history

Every recorded action can be edited or deleted, and whole rounds can be removed.
The match is replayed from scratch after any change, so standings always
recompute. If an edit makes a previously chosen winner illegal (for example, it
folds them), the match reopens and the group picks winners again.

## Quick comparison with standard poker

| This app | Standard poker |
| --- | --- |
| No blinds or ante | Blinds/ante force action |
| First preflop action must raise or fold | Players can call/limp or check in the big blind |
| No fixed turn order; you tap any player | Strict clockwise turn order |
| No hand ranking; winners picked manually | Best hand wins the pot |
| Fixed `minRaise` / `maxBet` from config | No-limit/pot-limit/fixed betting structures |
| Folded players cannot win | Same |
| Pot split equally among chosen winners | Side pots and split pots based on hands |
