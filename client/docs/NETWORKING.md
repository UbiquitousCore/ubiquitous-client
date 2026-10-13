# Networking

`src/net/GameConnection.ts` is the contract: named JSON messages over a
WebSocket (`WebSocketConnection`), with `OfflineConnection` for single-player.
`src/net/messages.ts` lists every message name.

## The rule

**The server sends state; the client resolves appearance.** No model path,
texture, geometry or animation crosses the wire. The one game-data reference
that does is an **entry id**, which both sides look up in the same tables.

Every message is a dotted name (`player.move`), a per-connection sequence
number and a JSON payload. No message number, byte layout or byte order
appears anywhere in `client/` (`WebSocketConnection.test.ts` enforces it); a
server speaking another wire format translates in its own process.

## Wire fixtures

`test/fixtures/*FromServer.json` hold what the server actually sends.
`wireVocabularyFromServer.json` and `sessionMessagesFromServer.json` are
written by the server byte for byte; the inventory one has the server's shape
with ids changed. After a rename on either side, regenerate them in
`ubiquitous-server` (`UBIQUITOUS_WRITE_WIRE_FIXTURES=1 dotnet test`) and copy them here.

## Invariants that fail silently

- **The player's own body is in `NetworkEntityMap`.** `onWorldEntered`
  carries `selfNetworkId`; every combat message about the player names that
  id. Without the link the cast bar, combat clips and damage numbers for the
  player resolve to no body and are dropped.
- **`onSpellReleased.targets` is who was struck**, and is what projectiles
  fly at and impacts play on. Reducing it to one id loses hits.
- **A player's position says where they were, so arriving proves nothing**;
  only their next message says they stopped. A creature's route is the
  opposite: the route ending _is_ the stop. `NetworkMotion.kind` carries
  which.
- **A far position sync carries no facing and no moving flag.** It may derive
  a facing but must not reclassify the gait.
- **Events before the zone loads are queued** and replayed in order on
  `NetworkBodies.open()`, which first clears the id map.
- Every facing on the wire uses the spawn tables' convention and goes through
  `gameYaw` in both directions.

## `ubiquitous.nav()`

Operator-only (`navigation.request { radius? }` → `navigation.ground`; others
get `protocol.error` `forbidden`). Draws the server's walkable polygons around
the player: a white line is a walkable link, and a join with no line cannot be
walked. The printed **drift** compares the ground's height under the player
with the player's height; a large drift means the ground was baked in the
wrong place. `baked: false` means no ground exists for that map, not an error.
