# Behaviour

Game behaviour the code depends on that cannot be read from the user's files.
Constants chosen by eye are marked **Own choice** where they are declared, not
here. Open work is in the [issue tracker](https://github.com/UbiquitousCore/ubiquitous-client/issues); where file-format
facts come from is in [PROVENANCE.md](PROVENANCE.md).

## Observed in play by the owner

Treat these as requirements.

- **Weapons.** An empty hand punches, a staff swings like a spear, a fist
  weapon punches, a wand throws. Put away: two-handers on the right of the
  back, staves and spears on the staff mount, shields on the back; fist
  weapons and off-hand rods stay in hand; blades, daggers, bows, crossbows
  and wands rest at their slot's hip or back. A bow in the ranged slot is
  drawn in the left hand.
- **Relationship.** A neutral body turns hostile at the first blow that lands
  either way; heals never turn anything hostile; a training dummy stays
  neutral.
- **Portraits** are front-facing headshots (face, neck, shoulder tips)
  whatever the body is playing.
- **Animation.** The chart cells marked "seen in play" in
  `gameplay/ClipMachine.ts`.
- **Jumping.** Nothing refuses a jump except a slide (below). A jump during a
  cast gives the cast up (`spell.abort`). A jump in water leaps out; a
  standing mount plays its flourish.
- **Steep slopes.** Ground whose normal is under 0.574 up (about 55°), terrain
  or model, starts a slide downhill at running pace; the keys and jump do
  nothing until ground at 0.67 up or more (about 48°), water or air ends it.
  A step onto such ground goes no further that frame, so no slope that steep
  can be climbed (`gameplay/PlayerMovement.ts`).
- **Falls.** The server decides fall damage; the client shows its
  `spell.outcome` `fall` as a number on the hero and "You land hard for …" in
  the damage log.
- **Approach.** Melee stops 2 units from the target's centre (server reach
  3). Creatures report no size; treat them as 1 unit in radius.
- **Retaliation.** A harmful blow on the living hero from a living hostile
  picks the attacker when nothing is picked (`gameplay/strikeBack.ts`).
- **Effects.** Every cast of one spell draws the same particles.
- **Target.** Escape, or a tap on no body, clears the target. The target's
  health always fills green.
- **Guide arrow.** Floats above and ahead of the player toward the target,
  larger than its model.
- **Auras** stand in a row under their unit's frame; pressing one shows its
  name, words and a countdown.
- **Items.** "Use" is offered only on things in the bag, boxes and chests
  included. A reward's card is filled from the item table, and that row's
  quality colours the name. In loot, the picture opens the card and the rest
  of the row takes it. The game asks before spending on a bag upgrade. Gold
  over seven figures reads 9,999,999.
- **Talents.** Points are staged, then confirmed; the confirm control shows
  only while a point is staged. There is no reset control (reset is an item).
- **Power meters.** Morale and vigor pips light at fixed power (20, 50, 100,
  120), not at a share of the meter. Every class wears the corner ornament
  and stands flush in the corner.
- **Red banner.** The leave-combat line may show while the hero is dead.
- **Cast bar** without a build fills dark green.
- **Quest window.** With one action its control stands alone in the middle
  of the foot (from public screenshots).

## Server behaviour the client works around

- A stealthed player is kept off other screens; a body this client already
  holds when stealth starts is stopped, untargeted and unselectable.
- Only the shooter hears a shot leave; other screens learn of it when it
  lands, so a remote archer is seen shooting late.
- Which way a remote body strafes never arrives; remote bodies only walk
  forward or back.
- The server sends no completion words for a quest, so hand-in shows the
  words it was given with.
- The client does not know which quests were handed in: a conversation
  counts a quest as held only while it is in the log.
- A loopback server (`ws://127.0.0.1:…`) is reached from other devices
  through the dev server's `/ubiquitous-server` forward, since an https page cannot
  open plain `ws://`.

## Approximations

- Water is one flat level per chunk, so lake edges are stepped; that is what
  the data describes.
- Collision treats cylinders as 12-sided prisms and spheres as boxes.
- A model with no `.phy` blocks as its bounds (a cylinder, a box when long
  and thin); small decor stays walk-through.
- Lists worn from the movie scroll a whole row at a time.
- A hidden tab keeps simulating, ticked every 50 ms from a worker timer,
  because a hidden page's own timers drop to once a second.
- Nothing plays until the page has had a click or key press (browser policy).
- The CJK typefaces the build ships (~17 MB) are not loaded; such characters
  use the fallback face.
