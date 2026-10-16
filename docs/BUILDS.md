# Game builds

The client and the server are built against **1.1.4**. Other builds can be supported: builds close to 1.1.4 should need little work, more distant ones more. This page is the log of what has been checked, and the rules for adding a build.

## Version log

| Build | Status | What is known |
|---|---|---|
| 1.1.4 | Primary | Everything here is built and checked against it: screens, formats, server data. |
| 2.2.0 | Partial | Maps, zones and terrain load. No sign-in form shows (only the 3D scene), so the game cannot be entered. Ground textures and a few models the maps name are absent from the build; the warnings for them are expected. |
| 1.0.2 | Partial | Particle effects are version 7, which the reader does not know, so effects and the scenery drawn by effects are skipped. |

Status words: **Primary** (built against), **Verified** (named areas checked, listed), **Partial** (some areas work, listed), **Untested**. Add a row per build with what was actually checked, and the date.

## How builds are handled

Today readers recognise their file's shape and the screens assume 1.1.4's string numbering; there is no per-build profile yet. The plan is in the issue tracker:

- A profile per build that names, for each area (tables, world tiles, models, textures, effects, interface strings, audio, collision), the parser it uses: [client#36](https://github.com/UbiquitousCore/ubiquitous-client/issues/36).
- Table schemas per build, with every column named, so differences such as column counts are visible: [client#38](https://github.com/UbiquitousCore/ubiquitous-client/issues/38).
- Captions resolved by word when a build numbers its strings differently: [client#39](https://github.com/UbiquitousCore/ubiquitous-client/issues/39).
- The same for the server's importer: [server#26](https://github.com/UbiquitousCore/ubiquitous-server/issues/26).
- 2.2.0 specifically: [client#40](https://github.com/UbiquitousCore/ubiquitous-client/issues/40).

Rules for a new build: reuse an existing parser where the files match; where a build matches only in part, say so in its profile and write a parser for the differing part only; keep parsers small so they compose; record the result in the version log above.

## Fallback UI

Where a screen cannot be worn (no art for it in the build, or its captions are not mapped for that build), the client may show a **fallback UI**: a minimal screen that exists only so the game can be run. Rules:

- It lives in its own area, `client/src/ui/fallback/`, and is marked as fallback on screen and in the DOM (`data-fallback`), so it is never mistaken for the original game's look.
- It is used only when the worn screen cannot be built; the worn screen always wins.
- It covers what is needed to run (sign in, pick or create a character, connection and error messages), not a second copy of the interface.
- Which screens fell back, and why, is logged in the compatibility report.

Tracked in [client#37](https://github.com/UbiquitousCore/ubiquitous-client/issues/37).

## Release history (reference)

Compiled from blogs, forums and wiki pages found online. It is **not a confirmed history**, but is close enough to place a build. Treat it as a guide, not a source of truth.

- Dates are as recorded in the source and the day/month order is mixed (for example 1.1.4 reads `10/1/2012` and 1.1.2 reads `8/1/2012`, yet 2.2.0 reads `11/1/2013` after 2.1.0 on `2/7/2013`). Check a date before relying on it.
- Some builds have no recovered changelog (1.0.1, 1.0.5, 1.1.3, 2.1.0, 2.2.0) and are inferred from archives.
- Builds with a build number in the iOS archive that differs from the community's name are noted (3.1.1 / v3.1.0.0).
- Verified status per build lives in the version log above, not here.

| Version | Date (as recorded) | What changed | Source |
|---|---|---|---|
| 1.0.0 | 27/04/2011 | Original release: 3D MMORPG, four races (Elf, Human, Orc, Undead), classes and talents, Haradon, quests, crafting, trading, parties, guilds, open PvP | [toucharcade.com](https://toucharcade.com/games/order-chaos-online) |
| 1.0.1 | 5/1/2011 | Bug fixes and stability. Release notes not recovered | [4pda.to](https://4pda.to/forum/index.php?showtopic=234782) |
| 1.0.2 | 30/06/2011 | New quests, language chat channels, armour and items, character customisation, server migration, cheaper teleport/death, anti-spawn-camping, Greenmont teleporter | [iphonesoft.fr](https://iphonesoft.fr/2011/06/30/order-chaos-online-enfin-mis-a-jour) |
| 1.0.3 | 25/08/2011 | Relic's Key (first dungeon), Normal/Legend modes, new weapons/armour, faces and skin colours, abuse reporting, inspection, target switching, casting bar, long-distance teleport, better trading | [iphonote.com](https://iphonote.com/actu/12020/gameloft-order-chaos-online-maj-1-0-3-beaucoup-de-nouveautes-a-decouvrir) |
| 1.0.4 | 28/09/2011 | Knahswahs Jail (first exploration dungeon), Normal/Legend modes, new weapons/armour | [idevice.ro](https://www.idevice.ro/2011/09/28/video-order-chaos-online-update-disponibil-in-app-store/) |
| 1.0.5 | 10/11/2011 | Error fixes. Exact publication date not firmly established | [prestige-gaming.ru](https://prestige-gaming.ru/ios_order_chaos_online-t33031.html) |
| 1.0.6 | 1/12/2011 | Temple of Eristars (third dungeon), Normal/Legend, daily quests, high-level items, crafting materials, new icon, chat settings, server optimisation | [ispazio.net](https://www.ispazio.net/269682/order-and-chaos-online-rilasciato-un-nuovo-importante-aggiornamento-per-il-famoso-mmorpg-video) |
| 1.0.7 | 15/12/2011 | Christmas Island, Christmas quests/items, Greenmont decorated, NPC clothing, high-level items, pets, new icon | [pocketgamer.com](https://www.pocketgamer.com/order-chaos-online/iphone-and-ipad-version-of-order-chaos-online-gets-new-island-pets-items-in-chri/) |
| 1.0.8 | 31/01/2012 | Levelling quests (Swamp of Wyrms, Whispering Islands), boosters, shop/interface changes, graphics for 4S/iPad 2 | [iphoneate.com](https://www.iphoneate.com/order-chaos-online-1-0-8) |
| 1.1.0 | 2/4/2012 | Sailen: The Lower City dungeon, Normal/Legend, level 40+ content, quests, items, iPad support, A5 graphics | [ispazio.net](https://www.ispazio.net/312692/order-and-chaos-online-rilasciato-un-importante-aggiornamento-che-introduce-un-nuovo-sotterraneo-video) |
| 1.1.1 | 31/05/2012 | First anniversary: 3G, talent reset/rebalance, quests, free gift, anniversary pet, fireworks, NPC clothing, items and pets, capital quiz, new lottery | [bgiphone.com](https://bgiphone.com/topic/12524-order-chaos-online/) |
| 1.1.2 | 8/1/2012 | PvP arenas, mounts, Sailen Part 2, quests and items, 30-day teleport pass, Kal Wardin costume, Gameloft LIVE, subscriptions removed, Russian and Portuguese, Chinese servers | [cultofmac.com](https://cultofmac.com/news/gamelofts-order-chaos-online-scraps-monthly-subscription-fee-in-latest-update) |
| 1.1.3 | 9/1/2012 | Build confirmed by a community archive; changelog not recovered (likely compatibility changes before iPhone 5 support) | [4pda.to](https://4pda.to/forum/index.php?showtopic=234782) |
| **1.1.4** | 10/1/2012 | **Primary target.** Optimised for the 4-inch Retina display on iPhone 5 | [iphoneforums.net](https://www.iphoneforums.net/threads/order-chaos-online.47740/) |
| 2.0.0 | 20/12/2012 | Major expansion: Mendels as a fifth race, Mendel starting area and story | [pocketgamer.com](https://www.pocketgamer.com/order-chaos-online/new-race-prepares-for-battle-in-huge-order-chaos-online-update/) |
| 2.0.1 | 11/4/2013 | Under Realm and Frostlund, level cap 70, mechanical monsters and bosses, two dungeons, Facebook login, new UI, weekly world bosses, faster dungeon grouping | [4pda.to](https://4pda.to/forum/index.php?showtopic=234782) |
| 2.1.0 | 2/7/2013 | Major level-70 content update. Full notes not recovered | [4pda.to](https://4pda.to/forum/index.php?showtopic=234782) |
| 2.2.0 | 11/1/2013 | Additional high-level PvE/PvP and progression content. Version confirmed in an iOS archive; changelog incomplete | [4pda.to](https://4pda.to/forum/index.php?showtopic=234782) |
| 2.3.0 | 10/12/2013 | New high-level dungeon, Winter Amusement Park Island, Mist Trader Camp, more gem slots, weekly tournaments, seasonal content | [phonearena.com](https://www.phonearena.com/news/Gameloft-unleashes-a-trine-of-updates-to-its-Order---Chaos-titles_id50267) |
| 2.4.0 | 28/01/2014 | Ruin of Vliya Temple and Fate of Collapse dungeons, race-specific mounts, Lunar Festival, Valentine's | [orderandchaosonline.fandom.com](https://orderandchaosonline.fandom.com/wiki/Game_Updates) |
| 2.5.0 | 30/04/2014 | Class balancing, haste changes, Black Market, Event Book, Hero Emblem, Kraken mounts, Agatha pet, Flame: Rebirth of Faith dungeon, Easter, Dragon Boat | [orderandchaosonline.fandom.com](https://orderandchaosonline.fandom.com/wiki/Game_Updates) |
| 2.6.0 | 6/8/2014 | 1,000 Days of Battle: free to download, Battlefield PvP, 2v2 and 4v4, leagues, Haradon Day, Magpie Festival | [orderandchaosonline.fandom.com](https://orderandchaosonline.fandom.com/wiki/Game_Updates) |
| 2.7.0 | 15/10/2014 | Twitch integration, Rising Flare: Chasing Shadow dungeon, Transmogrify, PvP mounts, contested PvP, Halloween, iOS 8 | [orderandchaosonline.fandom.com](https://orderandchaosonline.fandom.com/wiki/Game_Updates) |
| 2.8.1 | 18/12/2014 | Sanctuary capital, Rising Flare: Into the Darkness, tier-4 armour, mixed PvP/PvE zone, Christmas, Valentine's | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 2.9.1 | 20/02/2015 | Rising Flare: Burn Out the Night, three bosses, weapons/armour, Year of the Sheep, Wheel of Fortune, social invitations | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 2.9.2 | 23/04/2015 | Minor bug fixes | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 2.10.0 | 27/05/2015 | Flame Knight class, Stardust Realm, fourth anniversary, Emberwing Griffon, Tree of Chaos | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.0.0 | 7/9/2015 | Update 25: mage talent rework, class lotto, dungeon difficulty, account-bound pets, achievements/collections, Soul Dailies, legacy equipment, gem lotto, PvP-tag changes | [orderandchaosonline.fandom.com](https://orderandchaosonline.fandom.com/wiki/Update_v3.0.0.0) |
| 3.0.3 | 17/09/2015 | Minor bug fixes | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.1.1 | 22/10/2015 | Military Monk talents, chat channels reworked, lotto, combat statistics, Vintage Festival, new island, quests, food buffs. Community docs call it v3.1.0.0 | [orderandchaosonline.fandom.com](https://orderandchaosonline.fandom.com/wiki/Update_v3.1.0.0) |
| 3.2.0 | 15/12/2015 | Surma storyline, winter island, daily quests, sleigh, Christmas content | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.3.0 | 4/2/2016 | Rosy Island Valentine's, Year of the Fire Monkey, Valley of Dreams dungeon, Wu Kong, guild rivalries | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.4.0 | 14/04/2016 | Prophecy Circle dungeon, two bosses, Easter, coin reward system | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.5.1 | 29/06/2016 | Fifth anniversary, anniversary dungeon, legendary gems, redesigned talent system | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.5.2 | 11/7/2016 | Minor bug fixes | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.6.0 | 31/08/2016 | Polynia expansion, Daisauros, new cities/dungeons/areas, higher level cap, new loot system, mini-dungeons, gems | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.7.5 | 12/10/2016 | Daisauros Fortress, Sacrificial Altar, Petrified Forest, level cap 75, new spells/equipment/gems, Halloween, world bosses | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.8.2 | 13/12/2016 | Manaprisms, Protectors, Distorted Demesne dungeon, tier-6 gear, Christmas | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 3.9.0 | 25/01/2017 | Ancient-enemies dungeon/story, new Protector, final tier-6 armour, Chinese New Year, Valentine's | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 4.0.0 | 5/4/2017 | Protector powers, S3.5 PvP gear, Manaprism Laboratory, world boss, Easter, cherry blossom | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 4.1.0 | 8/6/2017 | Sixth anniversary, PvP Season 4, class rebalancing, T6 weapons, gems, wings, dungeons, bosses, mounts and pets | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 4.2.1 | 10/8/2017 | Shadow of the Manaprisms, Manaprism Laboratory dungeon, T7 armour, S4 PvP gear, new chat system, fashion, summer events | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 4.2.2 | 10/10/2017 | Hotfix; iPhone 8 / 8 Plus compatibility | [ipa4fun.com](https://www.ipa4fun.com/ipa/180715/) |
| 4.2.3 | 17/07/2018 | Minor bug fixes | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
| 4.2.4 | 28/11/2021 | Various fixes and improvements. Final known iOS App Store version | [ipa4fun.com](https://www.ipa4fun.com/history/648/) |
