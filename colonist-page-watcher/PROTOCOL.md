# Colonist WebSocket Tracker Protocol Notes

These notes come from the verified export at `%USERPROFILE%\Downloads\colonist-watcher\latest.json` analyzed on 2026-06-28. They document the WebSocket fields currently used by the tracker.

## Proven Signals

| Signal | Protocol evidence | Tracker use |
| --- | --- | --- |
| Player names/colors | `payload.playerUserStates[].selectedColor` and `username` | Maps protocol color ids to player names. |
| Local player color | `payload.playerColor` | Finds the user's exact hand snapshot for calibration. |
| Current hand snapshot | `gameState.playerStates[color].resourceCards.cards` or `diff.playerStates[color].resourceCards.cards` | Shows **Your Latest Hand** and scores card mappings. |
| Direct resource grants | message `type=28`, payload items with `owner`, `card`, `tileIndex`, `distributionType` | Primary source for resource-gain tracker events. The verified game had 52 grouped events covering 70 cards. |
| Dice roll log | game-log text `type=10`, `firstDice`, `secondDice` | Displays roll events and counts. |
| Build log | game-log text `type=4` or `type=5`, with `pieceEnum` | Tracks builds. `type=4` is free setup/placement; `type=5` is paid and subtracts cost. |
| Piece enum | `pieceEnum=0`, `2`, `3`, `5` | Road, settlement, city, robber labels. |
| Resource loss/discard | game-log text `type=14`, `15`, or `55`, with `cardEnums` | Subtracts known lost/discarded cards. |
| Steal | game-log text `type=16`, with thief/victim colors and hidden backs | Adds uncertainty to thief and victim. |
| Player trade | game-log text `type=115`, with given/received card enums and accepting player | Moves known cards between players. |
| Bank trade | game-log text `type=116` | Subtracts given cards and adds received cards for one player. |
| Trade offer | game-log text `type=117` or `118` | Displays trade offers; does not change card counts. |
| Robber | game-log text `type=11` or `49` | Displays robber movement. |
| Dev card played | game-log text `type=20`, with `cardEnum` | Counts dev card plays. |

## Verified Counts From Latest Export

- WebSocket frames: 2411
- Decoded frames: 2405
- Decode failures: 1
- Structured tracker events: 203
- Direct resource distributions: 52 events / 70 cards
- Build signals: 7 paid, 18 free, 0 unknown
- Tracker events: 94 trackable, 2 uncertain

## Resource Mapping

The WebSocket protocol mapping is fixed and verified against complete hand snapshots and build costs:

`card_1=lumber, card_2=brick, card_3=wool, card_4=grain, card_5=ore`

The extension no longer asks users to calibrate or guess this mapping.

## Tracker Rules

- Prefer message `type=28` for resource gains when available.
- Use game-log `type=47` resource gains only as fallback evidence.
- Charge build costs only for build logs whose raw game-log `type` is `5`.
- Do not charge build costs for raw game-log `type` `4`; those are free setup placements or free roads.
- Keep hidden steals as uncertainty because the stolen card identity is not visible.


## Hidden-card inference

Hidden steals are tracked as unresolved hidden cards with all five base resources as candidates. The tracker resolves a hidden card only when a later paid cost creates exactly one missing resource and exactly one unresolved hidden card could cover it. For example, if a player has brick, lumber, and wool, steals one hidden card, then pays for a settlement, the stolen card is resolved as grain before the settlement cost is applied. Ambiguous multi-deficit cases stay uncertain.
