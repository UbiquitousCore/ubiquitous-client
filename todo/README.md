# Open work

What is missing or wrong, written as behaviour, one line each. Delete a line
when it is done. **owner** waits on the project owner; **server** needs the
server project first.

## Loading and storage

- The audit's F-05/F-06: keep the packs and the GPU programs without keeping
  the copies; decide between reloading, a clearable cache or rewritten
  shaders — see [asset-processing.md](asset-processing.md) (**owner**).
- Every reload decodes models, textures and tiles again. Only the raw packs
  persist between sessions. Decide whether a decoded-resource cache is still
  worth building, and how much disk it may use (**owner**).
- Mounting several builds keeps a full copy of each; nothing evicts old packs.
- In dense zones, nearby textures can stay grey for a few seconds after a tile
  arrives. The per-frame upload limit has never been measured.
- Zone data is still assembled on the main thread for small payloads.
- Decide whether the loading screen should wait for collision to be ready.

## World, terrain and collision

- Indoor stairs, and building interiors in general, have no working collision.
  Decide whether stairs should block or let a body fall through before
  starting (**owner**).
- A footbridge in zone 145 can be fallen through.
- The camera rises through upper floors inside buildings.
- Nothing knows when the player is indoors, so entering a house does not
  dismount and the minimap never switches to its indoor variant.
- Lava, ice and harmful liquids all behave as plain water.

## Rendering

Fixed, awaiting the owner's check in play (at Silence, `-524.5 5.0 113.3`,
facing the portal):

- A ranger's or warrior's frame showed the meter's larger ornament instead
  of the small corner one a mage wears, and stood in from the corner.
- The mountains behind a zone looked far too large and close, not hazed
  like the distance. They are mostly the map's own far terrain, not the sky;
  the fog now reaches half as far past the zone's own and the sky fades into
  it at the horizon. The sky's horizon layer is lower and hazed, and now
  shows on the ground before the world too.
- Grass and bushes had black outlines at every setting.
- The whole picture was darker than the game's.
- A character's face sat off-centre in its ring on the character list (and
  in the hero's frame) when it carried a bow.

- The lighting rig, camera field of view, zoom range and eye height are chosen
  by eye and have never been compared side by side with the game (**owner**:
  needs comparison footage).
- A stained-glass window looks dark instead of glowing, and the Silence salon
  is darker than expected. The dungeon window beams (`dungeon_light01`) and
  the `building_light` lamp card may want to draw additively like the church
  shafts do; compare in play.
- Scrolling-texture animation built into models is ignored, so moving water
  such as the watermill's sits still.
- Rigged effect models (equipment wings, tails and several others) do not
  animate.
- Waterfalls and pools around the main city show tall white plumes instead of mist.
- Some effects flicker at random (light-post orbs, event-banner stars).
- Creature body effects, effects attached to items, cloud skies and weather
  (rain, snow, storms) are not shown.
- Particles do not spawn their own sub-effects.
- Line-stripe trail particles have not been checked against the game or pinned
  by a real-data test.
- Particle effects in the 1.0.2 build do not decode, so that build also loses
  scenery drawn by effects, such as streetlight posts and fountain basins.
  Decide whether 1.0.2 support is wanted (**owner**).
- Blended scenery (tree canopies, glass) draws once per placement; a blended
  surface cannot join a static batch.
- Static batches are not frustum-culled (`frustumCulled = false` in
  `staticBatch.ts`); split by cell or compact hidden rows.
- Fade materials keep the dither `discard` on every opaque surface, which
  disables early depth rejection on many GPUs.
- Ground tiles draw one call per texture triple; a `DataArrayTexture` would
  make it one per tile.
- Real-time shadows draw every caster in the window, not only those within
  `SHADOW_REACH`.
- Distant bodies are posed every frame; consider a lower update rate with
  distance (**owner**: visible loss of detail).
- `Renderer.sync` still walks every entity every frame to compare versions,
  because scenery's version and head icon change without telling anyone; the
  attach candidates are rebuilt and sorted on every tile add or drop.
- `World.updateNetwork` walks every entity every frame, including static
  placements that can never move; keep a dynamic set so statics are skipped.
- `collectShadows` scans every entity every frame to keep at most 200 discs;
  scan dynamic bodies only, or stride it off the frame, if the timings show it.
- The world passes have never been timed in a dense zone. Stand in the main
  city and read `networkMs`, `syncMs`, `hudMs`, `preMs` and `drawMs` from
  `ubiquitous.inspect()`, with draw calls and triangles, before optimising further
  (**owner**: needs the build on real hardware).
- On arriving in a zone every body is ungrounded at once and
  `NetworkBodies.settle` grounds them all in one frame; spread it over
  several if the timings show a spike.
- Picking a body builds its list of selectable views on every tap; keep it
  as views attach and detach if tapping in a dense zone shows up in a profile.
- The HUD rebuilds the map's places, regions, neighbours and routes on every
  publish, and compares them as JSON; cache them by region and fare stop.
- The HUD republishes world-unit rows and map state at 10 Hz even when
  nothing changed; publish only on change, in a single pass over entities.
- Collision and terrain cell lookups allocate a string key per query on the
  hottest path, and `wallsNear` allocates an array and a set per call; use
  numeric keys and reuse the scratch.
- Per-frame allocations: `syncTerrain`'s set
  and keys, `projectToScreen`'s `Vector3`, `NetworkBodies.updateClips`'
  closures.
- `buildTile` evaluates terrain last; stage ground before placements.
- Renderer caches (`MaterialCache`, prototypes, clip cache, ground masks) grow
  without bound for the session. Needs a measured budget.
- `TileStreamer.update` posts all requests at once and finishes work for
  evicted tiles.
- `tables.zones()` is not memoised and rescans spawn tables per zone load.
- `MaterialCache.hydrate` can upload one image twice when two materials
  share it; store the in-flight promise.
- Decide whether a WebGPU renderer is worth building once batching is
  measured (**owner**).
- Rendering has never been profiled on real hardware. Ground textures are
  never evicted, and there is no occlusion culling, so building interiors draw
  behind their own walls. Decide which hardware defines "fast enough"
  (**owner**).
- Chasing 144 Hz: the ordered frame-rate brief is `todo/fps.md`; take one
  number at a time.

## Movement and animation

- Landing from a jump plays no landing pose, snaps to the ground, and the
  camera bobs with every hop.
- Swimming sideways always plays the left stroke. There is no dive or surface
  pose, tilt or splash, and no droplets on screen after surfacing.
- The local player's backward walk looks wrong. Say whether the body spins,
  slides, plays the wrong clip or moves at the wrong speed (**owner**).
- Mounted movement has not been checked for gliding.
- Every mount uses the same speed boost.
- The aura card's Cancel strip sits where the movie parks it, below the
  hidden points row, so a gap shows between the card and the button.
- A rider's seat has only been checked on the brown horse; check the deer,
  lion, dead dog and the champion wolves, and whether `ride_wait` belongs
  anywhere.
- Talking NPCs swing their weapons. Eating or drinking plays no animation.
- A creature already fighting when it comes into view faces where it is
  walking, not its target, and NPCs do not face their target while moving
  (**server**: the movement message carries no target).
- Server-driven bodies walk through scenery (**server**: pathing).
- Some NPCs float slightly above the ground. Compare offline against online
  first.
- Groups of creatures drift apart instead of keeping formation.
- Another player's jump has never been confirmed visible on a live server.

## Combat

- The run looked slower than, or out of step with, its footsteps (reported
  by the owner). Fixed, the footsteps now follow the run clip's own
  footfalls; waiting for the owner to hear it in play. The run clip still
  plays at its own pace whatever the hero's speed; whether it should speed
  up with the hero, as other bodies' do, needs a look in play.
- Fighting in melee with two daggers, the first swing plays and then a second
  hit lands with no swing to go with it (reported by the owner). Fixed, the
  off hand now swings; waiting for the owner to see it in play.
- Hit effects are the wrong size and face the wrong way (**owner**: needs
  comparison footage).
- Hit-spark lines are all vertical.
- Plain melee swings draw no blade streak: only spell releases and ranged shots
  reach the ribbon, so a one-handed sword swing that streaks in the game shows
  nothing here. Swift Strike's own rows name streak 1 and its swords carry
  the blade dummies, yet it still shows nothing; which gate stops it is open.
- Emitters on a moving body still carry their particles along whenever either
  inherit mask is set; only projectiles leave theirs behind. Whether a buff's
  sparkles should trail a running body needs comparison footage (**owner**).
- No camera shake, and no weapon impact, block or parry sounds on plain
  swings. The defender plays no dodge, parry or block animation, and miss, dodge, parry and resist words are not shown.
- Resisted spells look the same as misses.
- Another player's cast has never been confirmed visible on a live server.
- A refused cast shows only a number, not a reason.
- The archer's shot does not cast.
- Check that the global cooldown expires.
- Wands fire an arrow (**server**: every ranged weapon sends the same visual).
- A capturable creature is never ringed or named purple: neither the files
  nor the server say which creatures can be captured (**server**).

- A quest giver plays `emote_salute` on accept and `emote_yes` on hand-in;
  the owner saw a gesture at both moments but the clips are unconfirmed
  (**owner**). The quest table's own emote columns (140-159) are unread.
- Pulling several creatures drops in and out of combat as each one dies
  instead of staying in combat while anything is still after the hero.
- The hero's weapons unwield between swings while still in combat, dropping
  to fists until the next hit re-equips them, instead of staying wielded.
- Corpses within about a meter of each other should loot together in one
  window instead of one corpse at a time.

## Sound

- Fight music comes on only in a duel. Arena battles and PvP zones are
  candidates too.
- Footsteps know wood and plain ground only; grass and rock have their own
  step sounds in the pack, but nothing in the files says which ground is
  which.
- Particle effect files carry a sound of their own, read and not played.
- Crafting sounds are not played.
- No zone's music has been compared by ear against the game in play
  (**owner**). `/dev/sound.html` plays any zone's music and ambience.

## Networking and server features

- Sign-in still sends the credential exactly as typed over cleartext `ws://`:
  serve every hosted build over TLS with a real auth scheme first (audit
  UBIQUITOUS-CLIENT-004) (**owner**/**server**).
- No reconnect: a dropped connection or a wrong password means reloading the
  page (**owner**).
- Characters cannot be deleted.
- Updates that arrive while a zone is still loading are queued; decide whether
  the protocol should change instead (**owner**).
- The position report rate is chosen, not tuned.
- Emotes cannot be sent, and incoming ones do not play.
- Chat has no channel picker or tabs, the trade channel cannot be joined,
  party chat is not offered, and a refused chat line is silent.
- The "stuck, send me to a graveyard" escape is not offered, and server errors
  in general show nothing on screen.
- Other players' PvP flags cannot be shown, and leader-only guild and party
  controls show to everyone (**server**/**owner**: protocol change).
- Weather and festival state is received and ignored.
- Spell teleports are not followed across maps (**server**); buses and the
  admin panel's teleport are.
- Spawn position is wrong after a reload (**server**).
- Corpses vanish after a zone change or relog (**server**).
- Spells dragged onto the action bar do not stay after the server replies
  (**server**).
- Nothing can be looted, because death and health updates do not reach the
  client (**server**). Group loot rolls are not wired.
- Quests never award spells, and older characters carry spell ids the
  tutorial quest cannot complete with (**server**).
- The attribute, combat-stat, friends, ignore, party-loot and mount screens
  are empty (**server**: the numbers are not sent).
- The spell book's mount page lists the mounts the player has, but its
  riding-skill and pet pages are not drawn.
- Talent trees are labelled "Tree 1"/"Tree 2" on the plain Talents tab:
  their names sit in `spell_skillset`, which no reader here opens yet.
- Mail has no expiry, so a letter cannot say how long it has left
  (**server**).
- Twenty-two trailing bytes after sign-in are unexplained. Nothing is broken.
- Conversation choices that run a script other than a teleport (item
  exchanges, quest steps, lighting a lamp, taking a ride) do nothing: the
  server answers "nothing happens", because the files name a script id per
  choice and say nothing about what it does (**server**).
- A conversation cannot tell a handed-in quest from one never taken, so pages
  meant for after a quest read as before it (**server**: the finished quests
  are not sent).

## Inventory, quests and screens

Reported by the owner, not yet fixed:

- The region map does not yet wear the lottery button, the zone-list page,
  or the merchant, tomb, team and town marks the movie carries, and the
  world map fits the whole picture to its window where the movie scrolls it.
- The minimap's zoom is the mouse wheel only; the movie's own control for it
  is not worn.
- The spell bar does not tint a slot for a target out of range: the client
  does not know the target's distance. Its slots show no count, and what the
  mount's slot holds is not saved.
- Professions are not built at all.
- The character sheet's attribute pages: the combat figures (melee,
  ranged, spell, defence) are blank because the server does not send them
  (**server**); the first page's list is left off until it is known what it
  lists; and the Defense page does not yet scroll to the lines below Block
  chance.
- Parry and block need a base chance: the server rolls them only from
  parry and block rating on gear (**server**/**owner**: what the base is).
- Team > Dungeon's exhaustion bar waits on the server, which has no
  exhaustion yet (**server**). The mode shown when the window opens is the
  last one the server confirmed this session; the server sends nothing on
  login, so a relog shows Normal until the leader saves again (**server**).
- Epic creatures do not wear their epic art around the target frame;
  nothing tells the client a creature is epic yet, and the target frame
  does not wear the build's art at all (see below).

- Stacks cannot be split.
- Stackable items do not stack: each one takes its own bag and loot slot
  instead of sharing one slot up to its stack size (usually 20) with the
  count worn at the bottom-right.
- The sort button is hidden because the server never answers it
  (**owner**/**server**).
- Accessory stat lines read as "attribute N" because nothing names them
  (**owner**).
- A quest's blocked state is never shown; only one quest can be tracked at a
  time; a choice of rewards always takes the first.
- A quest being handed back shows the words it was given with, because the
  server sends no completion words for it (**server**).
- Unknown spell or quest ids show a blank name or icon instead of a warning.
- The spell book's school tabs have no data, and its pages are not grouped by
  talent tree.
- Auction listings show cancel on other players' items and name items as
  "Item N".
- Settings lack camera, helmet and loot-message switches.
- Lists (bag, mailbox, quest log, spell book) scroll a whole row at a time,
  by wheel and drag as well as by their marks; they do not glide between rows.
- Long item names are clipped instead of wrapped.
- A screen can pause the first time it opens while its art loads.
- The target frame does not wear the art from the user's files yet
  (**owner**: review before it lands).
- A mail row cannot show its read or attachment icon.
- An unread letter, a finished quest step and a party leader are marked only
  by bold, which the build's one-weight typeface does not draw; they need a
  mark that is not a weight. Whether headings in the title face should also
  be upper-cased is unchecked against the game (**owner**).
- Characters outside the build's English typefaces (Chinese, Japanese,
  Korean) draw in the fallback; the build's wide typefaces are not loaded.
- Two underground regions (zones 700 and 607) have no place on the world map; bus routes that leave
  the region have no edge arrow; place names are one colour instead of
  coloured by friendliness.
- The zone picker is a developer dropdown. Decide whether it becomes a player
  feature (**owner**).
- Offline, there is no picker for race, sex, face or hair (**owner**: how far
  to take it).

## Screens still in the client's own built style

Everything here draws with this client's plain dialog, button and panel
pieces (`Dialog`, `ConfirmDialog`, `Button`, the `bg-chrome`/`border-brass`
utilities) instead of a screen from the build. Each wants the build's own
screen, or a message box (`ArtAskBox`) where one fits.

Debug popups (`showDebugInteraction`, drawn by `GameHud`):

- Teleport from the map while not at a teleport stop says so in a popup
  (`app/Game.ts`, map teleport handler).
- Teleport from the map to the stop already stood at says so in a popup
  (same place).
- A teleport fare the server never answers says so in a popup after a wait
  (same place).
- A refused equip says why in a popup titled "Equipment"
  (`app/features/inventory/inventory.ts`).
- A refused purchase says why in a popup titled "Not bought"
  (`app/features/vendor/vendor.ts`).
- An auctioneer or a talking NPC with no server behind it opens an
  "(offline)" popup (`app/helpers/npc/offlineServiceView.ts`).

Prompts with no screen of the build's yet:

- The death prompt: release, and the cost of dying (`ui/DeathPromptContainer.tsx`).
- A guild invitation (`ui/GuildInvitePromptContainer.tsx`).
- Naming a guild after using a guild stone (`ui/GuildFoundPromptContainer.tsx`).
- Reporting a player (`ui/ReportPlayerContainer.tsx`).
- A quest another player shares (`ui/AskPromptContainer.tsx`, the one question
  there with no message box).

Built pieces inside screens that otherwise wear the build's art:

- The auction house asks before a buy or a bid in a plain confirm, and a
  listing whose card cannot be drawn opens a plain dialog
  (`ui/components/ArtAuctionWindow.tsx`).
- Deleting a character asks in a plain confirm where the build has no box for
  it (`ui/frontend/ArtChooseCharacter.tsx`).
- The character sheet describes an item on the plain card where the build has
  no card screen (`ui/components/ArtCharacterWindow.tsx`, `ItemDetails`).
- The instance badge across the top of the HUD ("Instance copy of map N ·
  inferred, not reported") is a debug line, not anything the game shows
  (`ui/GameHud.tsx`).
- The chat panel and bubbles, the lines that pop over the hero, quest
  messages, the aura row, the spell being dragged to the bar, and the plinth an
  item stands on before its icon loads are drawn in the client's own style
  (`ui/components/ChatPanel.tsx`, `ChatBubbles.tsx`, `PopMessages.tsx`,
  `QuestMessages.tsx`, `AuraRow.tsx`, `SpellDragGhost.tsx`, `ItemSocket.tsx`).
- The question asked before a thing is thrown away is in this client's own
  words: which of the build's lines it is has not been found
  (`discardAsk` in `ui/art/screenMeanings.ts`).
- Key bindings are rows this client adds under the settings page's own,
  copied from its last switch row; the build has no key-binding page.
- An NPC with only words, in a build with no talking screen, speaks from the
  quest page, with what can be said back as plain underlined lines.

Things that have no screen at all now the debug windows are gone:

- Guild invites sent, declined and being removed from a guild say nothing on
  screen; they are only logged.
- Changing the open-world PvP flag has no control, and the server's answer is
  only logged. Forfeiting a duel has no control either.
- Leaving or disbanding a guild has no control; the social window invites and
  kicks only.
- Entering an instance copy of a map has no screen (resetting dungeons and the
  dungeon mode are on the team window's dungeon page).
- The admin panel itself is the client's own, and stays so (developer only).

## Tools and code

- There is only a command-line resource search; no page to browse packs and
  preview models, textures and tables (**owner**: where it lives).
- There is no way to replace a named resource with a user-supplied model or
  texture (**owner**: which asset type first).
- `Game.ts` is about 4,300 lines, and what is left in it coordinates: the
  zone load, teleport and arrival sequences, the HUD and map publish, and the
  combat, spell and death handlers, which need a dozen members each. A
  `HudSync` lifted whole would need the world, renderer, bodies, minimap,
  zone cache, area links and travel; lift a decision out with a test rather
  than a cluster (AGENTS.md §4.9).
- `Renderer.ts` is about 3,750 lines. Building and evicting entity views
  (`views`, the attach queue, `detach`) is the coherent part, but every clip,
  weapon, effect, icon and picking call reads `views`, so an
  `EntityViewManager` would carry the renderer with it. Lift its rules one
  at a time with a test, as `attachOrder.ts` and `ObjectShadows.ts` are, and
  keep every `new` beside its `dispose()`.
