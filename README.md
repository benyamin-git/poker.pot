# poker.pot

A phone-viewport pot manager for poker games with friends. It keeps a betting
ledger; it does not deal cards or rank hands, and the group picks the winners.

One phone is passed around the table. Each player taps their own name and records
fold / check / call / raise. Every action is written to disk as it happens, so a
sudden exit or shutdown does not lose the current round. History is visible and
editable, and standings recompute from it.

> **Not standard poker.** poker.pot runs a custom house ruleset with no blinds,
> no fixed turn order, and no hand ranking. The full ruleset is in
> [rules.md](rules.md). The [LICENSE](LICENSE) is "do whatever you want".

## Screenshots

| Sessions | Live match | Ledger |
| --- | --- | --- |
| ![Sessions list](docs/screenshots/sessions.png) | ![Active match](docs/screenshots/match.png) | ![Round history](docs/screenshots/history.png) |

| Session overview | Settings | First-run setup |
| --- | --- | --- |
| ![Session overview](docs/screenshots/session.png) | ![Settings](docs/screenshots/settings.png) | ![First-run setup](docs/screenshots/setup.png) |

Regenerate them with `bun run screenshots`. The script builds the app, starts a
throwaway server on port 4180 with its own temporary data directory (it does not
touch `location.yaml`), seeds a demo session, and captures the screens with
Playwright. Install the browser once with `bunx playwright install chromium`. If
the Playwright CDN is blocked, prefix the install with
`PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`.

## Quick start

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev
```

`bun run dev` starts two processes: the Bun API on `0.0.0.0:7403` and the Vite
dev server on `0.0.0.0:7404` (strict), which proxies `/api` to the API.

To serve the built app and API from one process, for a phone on the same
network:

```bash
bun run build
bun start
# or, for a detached background server:
./scripts/live.sh
```

`bun start` serves the client and API on `0.0.0.0:7403`. Open
`http://<computer-ip>:7403` on the phone. The API port comes from `PORT`
(default `7403`).

`scripts/live.sh` starts the same server detached (`nohup`), building `dist/`
first if needed. It logs to `/tmp/poker.pot-liveserver.log`, writes a pid to
`/tmp/poker.pot-liveserver.pid`, and prints the stop command. Override the port
with `LIVE_SERVER_PORT`.

Other scripts: `bun run test`, `bun run test:watch`, `bun run typecheck`,
`bun run lint`, `bun run format`, `bun run screenshots`.

`bin/dev`, `bin/build` and `bin/run` are wrappers around the matching `bun`
commands for shell aliasing.

## Data and config

Session data lives outside this repository, in a private folder you choose. The
pointer to that folder is `location.yaml` in this repo, which is **gitignored**;
a template ships as `location.example.yaml`. You can also set it through the
first-run setup screen, or point the server elsewhere with the
`POKER_LOCATION_FILE` environment variable (which selects the location file, not
the data directory).

```
<dataDir>/
  config.yaml          # players, minRaise, maxBet, optional currencyLabel
  sessions/<id>.yaml   # one file per session, full history
```

Keep `<dataDir>` as its own private git repository to back it up. The files are
human-readable YAML, so diffs are meaningful. Never put the data folder inside
this repository.

`config.yaml` holds the players and the two betting limits:

```yaml
players:
  - id: 3f0c...          # stable id; history references this, never the name
    name: Ali
minRaise: 5             # a raise must beat the round's current bet by this much
maxBet: 100             # cumulative per match; reaching it is all-in
currencyLabel: chips    # optional
```

Full player ids are generated when players are added through the settings
screen. Removing a player only affects future match pickers: past matches keep
their own participant snapshot.

Every mutation is validated, applied in memory, then written with a temp-file
plus rename under a per-session lock. Unreadable session files are moved to
`sessions/.quarantine/` instead of breaking the app.

## Betting rules

The full ruleset is in [rules.md](rules.md). In short:

- Every session starts at zero. Balances can go negative; it is a ledger, not a
  stack of physical chips.
- Preflop, you can fold or raise but not check, so the first player must open
  with at least `minRaise`. Calls are allowed once there is a bet.
- Later rounds, check when there is no bet; otherwise fold, call (match the
  round's highest bet), or raise (beat it by at least `minRaise`).
- A raise reopens the action for anyone who already acted and is now behind.
- `maxBet` is cumulative across the whole match. Hitting it is all-in; that
  player sits out further rounds but can still win.
- Folding is final, and folding as the last active player is blocked. If
  everyone else folds, the last player wins automatically.
- Winners are chosen manually from the players who have not folded. The pot is
  split equally; leftover chips go to random winners, and the assignment is
  stored so history never changes.

Chip counts are integers.

## Tests

`bun run test` runs the Vitest suite (Node environment, no browser):

- `domain` — replay, raises/calls/folds, all-in and winner payouts.
- `domain-commands` — history edits, session lifecycle and error codes.
- `domain-invariants` — seeded random valid play asserting the ledger stays
  zero-sum.
- `config` — `validateConfig` and `resolvePlayers`.
- `server` — setup, config and session REST routes over a temp data directory.
- `client-format` and `ui` — client helpers plus SSR smoke renders.

## Project layout

```
src/domain/    pure ledger engine (sessions, matches, rounds, winners)
src/server/    Bun HTTP API, atomic YAML storage, setup and config
src/client/    React + Vite app
src/shared/    API types shared by client and server
tests/         Vitest suites
scripts/       Playwright screenshot generator
```
