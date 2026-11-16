# Table columns, build by build

Generated from `client/src/assets/formats/tableLayouts.ts` and
`client/dev/tableColumnNotes.ts`; do not edit by hand. To write it again:

```bash
UPDATE_DOCS=1 npx vitest run test/tableColumnsDoc.test.ts
```

One section per table, one row per column or run of columns. The leading
cells give the column's number in each build's own format; an empty cell
means that build does not have it. A build no heading names has the
1.1.4 arrangement. **Type** is the format letter
(`ftable.md`). **Read as** is the name the client reads the column under,
and is empty for a column it does not read. **Holds** says what the rows
show; "not settled" marks a column whose values are described but whose
meaning is not known. A row with neither is a column nobody has looked at,
or one that is empty in every build on hand.

## `c_animationdata`

1.1.4: 5 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | s | `name` |  |
| 2 | u | `loop` |  |
| 3-4 | u |  |  |

## `c_sound`

1.1.4: 18 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | u | `variants` |  |
| 2 | u | `flags` |  |
| 3 | s | `path` |  |
| 4 | f | `volume` |  |
| 5 | f |  |  |
| 6 | f | `reach` |  |
| 7 | u | `bank` |  |
| 8-17 | u |  |  |

## `c_sound_bank`

1.1.4: 3 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0-1 | u s |  |  |
| 2 | u | `capacity` |  |

## `c_spellvisual`

1.1.4: 13 columns; 1.0.0 to 1.1.1: 12 columns.

| 1.1.4 | 1.0.0 to 1.1.1 | Type | Read as | Holds |
| --- | --- | --- | --- | --- |
| 0 | 0 | u |  |  |
| 1 | 1 | u | `opening` |  |
| 2 | 2 | u | `windUp` |  |
| 3 | 3 | u | `release` |  |
| 4 | 4 | u | `impact` |  |
| 5 | 5 | u | `lasting` |  |
| 6 | 6 | u | `area` |  |
| 7 |  | u | `ending` |  |
| 8 | 7 | u | `missile` |  |
| 9 | 8 | u | `streak` |  |
| 10 | 9 | u | `impactDelay` |  |
| 11-12 | 10-11 | s |  |  |

## `c_spellvisualeffect`

1.1.4: 10 columns; 1.0.0: 8 columns.

| 1.1.4 | 1.0.0 | Type | Read as | Holds |
| --- | --- | --- | --- | --- |
| 0 | 0 | u |  |  |
| 1 | 1 | s | `name` |  |
| 2 | 2 | s | `path` |  |
| 3-5 | 3-5 | i |  |  |
| 6 | 6 | u | `scale` |  |
| 7 | 7 | u | `placement` |  |
| 8 |  | u | `flight` |  |
| 9 |  | u | `projectiles` |  |

## `c_spellvisualstate`

1.1.4: 12 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | u | `clip` |  |
| 2-7 | u | `effects` |  |
| 8 | u | `sound` |  |
| 9 | u | `shake` |  |
| 10 | u | `clipBlend` |  |
| 11 | s |  |  |

## `character_class`

1.1.4: 8 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u | `id` |  |
| 1-2 | u |  |  |
| 3-5 | u | `trees` |  |
| 6-7 | u |  |  |

## `character_race`

1.1.4: 7 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u | `id` |  |
| 1-2 | u |  |  |
| 3 | u | `maleDisplay` |  |
| 4 | u | `femaleDisplay` |  |
| 5 | u | `nameString` |  |
| 6 | u |  |  |

## `chat_menu`

1.1.4: 14 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | u | `text` |  |
| 2-7 | u | `scripts` |  |
| 8-13 | u | `subMenus` |  |

## `creature_appearance`

1.1.4: 7 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | k | `name` |  |
| 2-4 | k u |  |  |
| 5 | u | `display` |  |
| 6 | u |  |  |

## `creature_proto`

1.1.4: 74 columns; 1.0.0 to 1.0.3: 64 columns; 1.1.0 and 1.1.1: 68 columns; 2.5.0: 75 columns; 4.2.21: 79 columns.

| 1.1.4 | 1.0.0 to 1.0.3 | 1.1.0 and 1.1.1 | 2.5.0 | 4.2.21 | Type | Read as | Holds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0 | u |  | The creature id, and the row key; `creature_appearance` shares it. |
| 1 | 1 | 1 | 1 | 1 | u |  | 1 to 9: 1 on 1,522 rows of people, 2 on beasts, 5 on skeletons. Not settled. |
| 2 | 2 | 2 | 2 | 2 | u |  | Empty in every build on hand. |
| 3 | 3 | 3 | 3 | 3 | u |  | 1 to 5 on 390 rows. Not settled. |
| 4-5 | 4-5 | 4-5 | 4-5 | 4-5 | u |  | The least and most level (4 at or under 5 on 2,359 of 2,360 rows). |
| 6 | 6 | 6 | 6 | 6 | u |  | 1 on 1,176 rows and 2 on 120. Not settled. |
| 7-8 | 7-8 | 7-8 | 7-8 | 7-8 | u |  | A least and a most that climb with level: 89 to 109 at level 2, 2,904 to 3,549 at 58. |
| 9 | 9 | 9 | 9 | 9 | u |  | A number on 394 rows. Not settled. |
| 10 | 10 | 10 | 10 | 10 | f | `scale` |  |
| 11 | 11 | 11 | 11 | 11 | u | `flags` | One bit per service the creature offers. |
| 12 | 12 | 12 | 12 | 12 | u |  | A time in milliseconds: 2,000 on 2,163 rows, 1,000 to 4,000 on the rest. |
| 13 | 13 | 13 | 13 | 13 | u |  |  |
| 14-15 | 14-15 | 14-15 | 14-15 | 14-15 | u |  | A least and a most that climb with level, a tenth the size of 7 and 8. |
| 16-18 | 16-18 | 16-18 | 16-18 | 16-18 | u |  | Set together on 234 rows: 2,000, then a least and a most. Not settled. |
| 19-20 | 19-20 | 19-20 | 19-20 | 19-20 | u |  | Times in seconds, equal on 2,332 rows: 180 on most, ten to twelve hours on about 150. |
| 21 | 21 | 21 | 21 | 21 | u |  | Set on 207 rows. Not settled. |
| 22 | 22 | 22 | 22 | 22 | u |  | A number that climbs with level: 58 at level 2, 567 at 58. |
| 23-28 | 23-28 | 23-28 | 23-28 | 23-28 | u |  | Six numbers, 5 to 120, set on a dozen rows. |
| 29-32 | 29-32 | 29-32 | 29-32 | 29-32 | u |  | 5 on nearly every row. |
| 33 | 33 | 33 | 33 | 33 | u |  |  |
| 34-35 | 34-35 | 34-35 | 34-35 | 34-35 | f |  | Floats: 2 and 1 on most rows. Not settled. |
| 36-39 | 36-39 | 36-39 | 36-39 | 36-39 | s u |  | Empty in every build on hand. |
| 40 | 40 | 40 | 40 | 40 | u |  |  |
| 41-43 | 41-43 | 41-43 | 41-43 | 41-43 | u |  | 200, 400 and 150 on most rows. Not settled. |
| 44 | 44 | 44 | 44 | 44 | u |  | Bit flags. Not settled. |
| 45-50 | 45-50 | 45-50 | 45-50 | 45-50 | u |  | Empty in every build on hand. |
| 51 | 51 | 51 | 51 | 51 | u |  | 1 on 363 rows and 2 on 186. Not settled. |
| 52 | 52 | 52 | 52 | 52 | u |  | Bit flags on 90 rows. Not settled. |
| 53-54 | 53-54 | 53-54 | 53-54 | 53-54 | u |  | A least and a most on 452 rows (53 at or under 54 on all but one). |
| 55 |  |  | 55 | 55 | s |  | A number written as text. |
|  | 55 | 55 |  |  | u |  | A number where 1.1.4 has the text of column 55. Not settled. |
| 56 | 56 | 56 | 56 | 56 | u | `greetingMenu` | A `chat_menu` key: what it says when greeted. |
| 57 | 57 | 57 | 57 | 57 | u |  | Empty in every build on hand. |
| 58-60 | 58-60 | 58-60 | 58-60 | 58-60 | u |  | Ids on under 800 rows. Not settled. |
| 61 | 61 | 61 | 61 | 61 | f |  | A float: 4 on 646 rows. Not settled. |
| 62-63 | 62-63 | 62-63 | 62-63 | 62-63 | u |  |  |
| 64 |  | 64 | 64 | 64 | u |  |  |
| 65-66 |  | 65-66 | 65-66 | 65-66 | u |  | The levels of columns 4 and 5 again, equal to them on 2,283 rows. |
| 67 |  | 67 | 67 | 67 | f |  |  |
| 68-69 |  |  | 68-69 | 68-69 | u |  |  |
| 70-73 |  |  | 70-73 | 70-73 | u |  | Item ids on 22 rows. Not settled. |
|  |  |  | 74 | 74 | u |  | 0 or 1. |
|  |  |  |  | 75-78 | u f |  | In 4.2.21: a 0-or-1, a number that is 1 on nearly every row, a time-like number (10,000 to 45,000) on 40 rows, and a float. |

## `creature_spawns`

1.1.4: 42 columns; 1.0.0 and 1.0.1: 35 columns.

| 1.1.4 | 1.0.0 and 1.0.1 | Type | Read as | Holds |
| --- | --- | --- | --- | --- |
| 0 | 0 | u |  |  |
| 1 | 1 | u | `entry` |  |
| 2 | 2 | u | `map` |  |
| 3 | 3 | f | `x` |  |
| 4 | 4 | f | `y` |  |
| 5 | 5 | f | `z` |  |
| 6 | 6 | f | `yaw` |  |
| 7-34 | 7-34 | c u h f |  |  |
| 35-41 |  | u |  |  |

## `creaturedisplayinfo`

1.1.4: 8 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | u | `model` |  |
| 2 | u |  |  |
| 3 | u | `scale` |  |
| 4 | u |  |  |
| 5 | s | `skin` |  |
| 6 | s |  |  |
| 7 | u | `extra` |  |

## `creaturedisplayinfoextra`

1.1.4: 16 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | i | `features` |  |
| 2 | i | `hairStyle` |  |
| 3 | i | `hairColor` |  |
| 4-15 | u | `items` |  |

## `creaturemodeldata`

1.1.4: 17 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0-1 | u i |  |  |
| 2 | s | `path` |  |
| 3-15 | s |  |  |
| 16 | u | `sounds` |  |

## `itemdisplayinfo`

1.1.4: 10 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | u | `model` |  |
| 2 | u | `secondModel` |  |
| 3 | s | `texture` |  |
| 4 | s | `secondTexture` |  |
| 5 | s | `icon` |  |
| 6-9 | s u |  |  |

## `itemmodeldata`

1.1.4: 15 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0-1 | u i |  |  |
| 2 | s | `path` |  |
| 3-8 | s | `effectNodes` |  |
| 9-14 | s | `effectFiles` |  |

## `items`

1.1.4: 113 columns; 1.0.0 and 1.0.1: 104 columns; 1.0.3: 105 columns; 1.1.0 and 1.1.1: 109 columns; 2.2.0: 114 columns; 2.5.0: 118 columns; 4.2.21: 136 columns.

| 1.1.4 | 1.0.0 and 1.0.1 | 1.0.3 | 1.1.0 and 1.1.1 | 2.2.0 | 2.5.0 | 4.2.21 | Type | Read as | Holds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | u |  | The item id, and the row key. |
| 1 | 1 | 1 | 1 | 1 | 1 | 1 | u | `itemClass` | The class: 2 on weapons, 4 on armour, 0 on things used up, 7 on crafting handbooks, 10 on materials and quest items, 14 on mounts. |
| 2 | 2 | 2 | 2 | 2 | 2 | 2 | u | `subClass` | The sub-class within the class. |
| 3 | 3 | 3 | 3 | 3 | 3 | 3 | k | `nameString` | A `String_Item` key: the name. |
| 4 | 4 | 4 | 4 | 4 | 4 | 4 | u | `look` |  |
| 5 | 5 | 5 | 5 | 5 | 5 | 5 | u | `quality` | The quality, 1 to 6. |
| 6 | 6 | 6 | 6 | 6 | 6 | 6 | u |  | 1 on 525 rows, 3 on 34, 2 on 3. Not settled. |
| 7 | 7 | 7 | 7 | 7 | 7 | 7 | u |  | Empty in every build on hand. |
| 8 | 8 | 8 | 8 | 8 | 8 | 8 | u |  | The price to buy. |
| 9 | 9 | 9 | 9 | 9 | 9 | 9 | u |  | The price it sells for: a third of column 8, rounded down, on 4,326 of 4,328 priced rows. |
| 10 | 10 | 10 | 10 | 10 | 10 | 10 | u |  | 1 on the gold item alone. |
| 11 | 11 | 11 | 11 | 11 | 11 | 11 | u | `wornOn` | The slot it is worn in; 0 on what is not worn. |
| 12 | 12 | 12 | 12 | 12 | 12 | 12 | u |  | 1 on 645 rows and 2 to 50 on 44. Not settled. |
| 13 | 13 | 13 | 13 | 13 | 13 | 13 | u | `wearerClasses` | One bit per class that may wear it. |
| 14 | 14 | 14 | 14 | 14 | 14 | 14 | u |  |  |
| 15 | 15 | 15 | 15 | 15 | 15 | 15 | u |  | A level, set on worn items and at or above `levelNeeded` on 2,330 of the 2,353 rows with both. |
| 16 | 16 | 16 | 16 | 16 | 16 | 16 | u | `levelNeeded` | The level needed to use it. |
| 17-18 | 17-18 | 17-18 | 17-18 | 17-18 | 17-18 | 17-18 | u |  |  |
| 19 | 19 | 19 | 19 | 19 | 19 | 19 | u |  | A spell id (99% are spells) on handbooks, skill books and mounts: a handbook names its craft. |
| 20 | 20 | 20 | 20 | 20 | 20 | 20 | u |  | A spell id on three mount items. |
| 21 | 21 | 21 | 21 | 21 | 21 | 21 | u |  | Empty in every build on hand. |
| 22 |  |  |  | 22 | 22 | 22 | u |  | Empty in every build on hand. |
| 23 | 22 | 22 | 22 | 23 | 23 | 23 | u |  | 1 on 57 rows. Not settled. |
| 24 | 23 | 23 | 23 | 24 | 24 | 24 | u |  | 1 on 65 rows. Not settled. |
| 25 | 24 | 24 | 24 | 25 | 25 | 25 | u |  | How many stack in one slot: 1 on 3,063 rows, then 20, 10, 5. |
| 26 | 25 | 25 | 25 | 26 | 26 | 26 | u |  | Empty in every build on hand. |
| 27 | 26 | 26 | 26 | 27 | 27 | 27 | u |  | How many of the stat pairs that follow are set, on 5,033 of 5,034 rows. |
| 28-45 | 27-44 | 27-44 | 27-44 | 28-45 | 28-45 | 28-45 | u | `statsFirst` | Nine pairs of a stat kind and its amount. |
| 46-47 | 45-46 | 45-46 | 45-46 | 46-47 | 46-47 | 46-47 | u |  | Empty in every build on hand. |
| 48-53 | 47-52 | 47-52 | 47-52 | 48-53 | 48-53 | 48-53 | f u | `damageFirst` | Least, most and kind of damage, twice. |
| 54 | 53 | 53 | 53 | 54 | 54 | 54 | u | `armour` | Armour. |
| 55 | 54 | 54 | 54 | 55 | 55 | 55 | u | `delay` | The time between swings, in milliseconds: 1,000 to 5,000 on the 759 weapons. |
| 56-57 | 55-56 | 55-56 | 55-56 | 56-57 | 56-57 | 56-57 | u f |  | Empty in every build on hand. |
| 58-63 | 57-62 | 57-62 | 57-62 | 58-63 | 58-63 | 58-63 | u | `spellsFirst` | The first spell slot: the spell, then when it fires (1 on things used, 2 on things worn), an empty column, a time in seconds (60 on 32 potions), an item id that 17 potions share (the id of one of them), and a second time in seconds (30 on those 17). |
| 64-69 | 63-68 | 63-68 | 63-68 | 64-69 | 64-69 | 64-69 | u |  | The second spell slot, in the same shape; set on one row in 1.1.4 and 58 in 4.2.21. |
| 70 | 69 | 69 | 69 | 70 | 70 | 70 | u | `binding` | How it binds, 1 to 4. |
| 71 | 70 | 70 | 70 | 71 | 71 | 71 | k | `descriptionString` | A `String_Item` key: the description. |
| 72-74 | 71-73 | 71-73 | 71-73 | 72-74 | 72-74 | 72-74 | u |  | Empty in every build on hand. |
| 75 | 74 | 74 | 74 | 75 | 75 | 75 | u | `startsQuest` | A `quests` key: the quest it starts. |
| 76-79 | 75-78 | 75-78 | 75-78 | 76-79 | 76-79 | 76-79 | u |  | Empty in every build on hand. |
| 80 | 79 | 79 | 79 | 80 | 80 | 80 | f |  | A float on 558 worn items, 0.2 to 1,074. Not settled. |
| 81 | 80 | 80 | 80 | 81 | 81 | 81 | u | `block` | Block. |
| 82 | 81 | 81 | 81 | 82 | 82 | 82 | u |  | Empty in every build on hand. |
| 83 | 82 | 82 | 82 | 83 | 83 | 83 | u |  | 10 to 160 on weapons and armour and on nothing else. Not settled. |
| 84-85 | 83-84 | 83-84 | 83-84 | 84-85 | 84-85 | 84-85 | u |  | Empty in every build on hand. |
| 86 | 85 | 85 | 85 | 86 | 86 | 86 | u |  | A time in seconds on five rows: 30 days on a monthly pass, 21 days on three mounts. |
| 87-92 | 86-91 | 86-91 | 86-91 | 87-92 | 87-92 | 87-92 | u |  | Empty in every build on hand. |
| 93-94 | 92-93 | 92-93 | 92-93 | 93-94 | 93-94 | 93-94 | u |  |  |
| 95-101 | 94-100 | 94-100 | 94-100 | 95-101 | 95-101 | 95-101 | u s |  | Empty in every build on hand. |
| 102 | 101 | 101 | 101 | 102 | 102 | 102 | s |  | The name of a region, on 316 materials. |
| 103 | 102 | 102 | 102 | 103 | 103 | 103 | u |  | A number on 596 rows, half of them handbooks. Not settled. |
| 104 | 103 | 103 | 103 | 104 | 104 | 104 | u |  | 1 to 25 on skill books, handbooks and mounts. Not settled. |
| 105 |  |  | 104 | 105 | 105 | 105 | u |  | An `item_set` key: the set it belongs to (154 of 154; 777 of 777 in 4.2.21). |
| 106-108 |  |  | 105-107 | 106-108 | 106-108 | 106-108 | u |  | Set on four festival items. |
| 109 |  |  |  | 109 | 109 | 109 | u |  | 1 or 2 on 57 weapons. Not settled. |
| 110 |  |  |  | 110 | 110 | 110 | u |  | Set on four wands. |
| 111 |  |  |  | 111 | 111 | 111 | u |  | 150 to 5,000 on 332 handbooks. Not settled. |
| 112 |  |  |  | 112 | 112 | 112 | u |  | 1,000 to 74,000 on skill books and food. Not settled. |
|  |  | 104 | 108 | 113 | 113 | 113 | u s |  | From 2.2.0 a string: a price in other items, written `<item id> * <count>` and joined with `+`; every id is an item. The number 1.0.3 to 1.1.1 end on is a different column. |
|  |  |  |  |  | 114-115 | 114-115 | u |  |  |
|  |  |  |  |  | 116 | 116 | u |  | In 4.2.21, an item id on gems. |
|  |  |  |  |  | 117 | 117 | u |  |  |
|  |  |  |  |  |  | 118 | u |  |  |
|  |  |  |  |  |  | 119 | u |  | In 4.2.21, 40, 60, 70 or 75 on weapons and armour: a Lesser, a plain and a Greater sword carry 40, 60 and 70. |
|  |  |  |  |  |  | 120 | f |  |  |
|  |  |  |  |  |  | 121-133 | s u |  | In 4.2.21, set on 18 items of class 16 only: id lists as strings, a spell id, and small numbers. |
|  |  |  |  |  |  | 134-135 | u |  | In 4.2.21, on the 60 boxes of class 17: a time in seconds (1,800 to 43,200) and a count. |

## `map_info`

1.1.4: 18 columns; 1.0.0: 15 columns; 2.2.0 on: 21 columns.

| 1.1.4 | 1.0.0 | 2.2.0 on | Type | Read as | Holds |
| --- | --- | --- | --- | --- | --- |
| 0-4 | 0-4 | 0-4 | u |  |  |
|  |  | 5-7 | f |  |  |
| 5-8 | 5-8 | 8-11 | f u |  |  |
| 9 | 9 | 12 | s | `name` |  |
| 10 | 10 | 13 | s | `world` |  |
| 11-14 | 11-14 | 14-17 | u f |  |  |
| 15-17 |  | 18-20 | u |  |  |

## `mountprototype`

1.1.4: 9 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u | `id` |  |
| 1 | u |  |  |
| 2 | s | `model` |  |
| 3 | s | `texture` |  |
| 4-7 | u |  |  |
| 8 | s | `effect` |  |

## `quests`

1.1.4: 167 columns; 4.2.21: 168 columns.

| 1.1.4 | 4.2.21 | Type | Read as | Holds |
| --- | --- | --- | --- | --- |
| 0 | 0 | u |  | The quest id, and the row key. |
| 1 | 1 | u |  | 1 to 13. Not settled. |
| 2 | 2 | u |  | Empty in every build on hand. |
| 3 | 3 | u |  | A bit mask. Not settled. |
| 4-5 | 4-5 | u |  | Two levels, 1 to 61. |
| 6 | 6 | u |  | 1, 10, 100 or 1,000. Not settled. |
| 7-8 | 7-8 | u |  |  |
| 9-12 | 9-12 | u |  | Empty in every build on hand. |
| 13-14 | 13-14 | u |  |  |
| 15 | 15 | u |  | Empty in every build on hand. |
| 16 | 16 | u |  | A quest id on 299 rows; that quest names this one back in columns 122 to 125 on 273. |
| 17-18 | 17-18 | u |  | An item id and a count, on 78 rows. |
| 19-23 | 19-23 | u |  | Keys of `quests_zones`, which holds a map and a position. |
| 24 | 24 | k |  | A `String_Quest` key: the title. |
| 25 | 25 | k |  | A `String_Quest` key: what the giver says. |
| 26 | 26 | k |  | A `String_Quest` key: what to do, in a line. |
| 27-34 | 27-34 | k |  | Eight more `String_Quest` keys; 28 is what is said at the end. The rest are not settled. |
| 35-38 | 35-38 | u |  | Up to four item ids to bring. |
| 39-42 | 39-42 | u |  | How many of each item, set on the same rows as 35 to 38. |
| 43-58 | 43-58 | u |  | Creature ids, in four groups of four. |
| 59-62 | 59-62 | u |  | Up to four `staticobject_proto` ids. |
| 63-66 | 63-66 | u |  | Counts, 1 to 30. |
| 67-70 | 67-70 | u |  | Spell ids on 29 rows. |
| 71-74 | 71-74 | u |  | Empty in every build on hand. |
| 75-78 | 75-78 | u |  | Up to four item ids, with their counts in 81 to 84. |
| 79 | 79 | u |  |  |
| 80 | 80 | u |  | Empty in every build on hand. |
| 81-84 | 81-84 | u |  | Counts for 75 to 78, 1 on nearly every row. |
| 85 | 85 | u |  |  |
| 86 | 86 | u |  | Empty in every build on hand. |
| 87-88 | 87-88 | u |  | Up to two item ids, with their counts in 91 and 92. |
| 89-90 | 89-90 | u |  |  |
| 91-92 | 91-92 | u |  | Counts for 87 and 88. |
| 93-94 | 93-94 | u |  |  |
| 95-107 | 95-107 | u i |  | Empty in every build on hand. |
| 108-109 | 108-109 | i u |  | Two amounts that climb with the levels; 2.5.0 and 4.2.21 retune them. |
| 110-115 | 110-115 | u |  | Empty in every build on hand. |
| 116-120 | 116-120 | u |  |  |
| 121 | 121 | s |  | Quest ids, written as text with spaces between. |
| 122-125 | 122-125 | u |  | Quest ids, each lower than the row key on 476 of 508 rows. |
| 126 | 126 | s |  | Empty in every build on hand. |
| 127 | 127 | u |  | An item id on five rows. |
| 128-130 | 128-130 | u |  | Empty in every build on hand. |
| 131 | 131 | u |  |  |
| 132-138 | 132-138 | u |  | Empty in every build on hand. |
| 139 | 139 | u |  |  |
| 140-142 | 140-142 | u |  | Small ids on 66 rows. Not settled. |
| 143-148 | 143-148 | u |  |  |
| 149-151 | 149-151 | u |  | Small ids on 66 rows. Not settled. |
| 152-153 | 152-153 | u |  | Empty in every build on hand. |
| 154 | 154 | u |  |  |
| 155-157 | 155-157 | u |  | Empty in every build on hand. |
| 158-159 | 158-159 | u |  | Small ids on 18 rows. Not settled. |
| 160-162 | 160-162 | s u |  |  |
| 163-166 | 163-166 | u |  | Empty in every build on hand. |
|  | 167 | u |  | In 4.2.21, set on five quests. |

## `sound_solution`

1.1.4: 17 columns; 1.0.0 to 1.1.1: 16 columns.

| 1.1.4 | 1.0.0 to 1.1.1 | Type | Read as | Holds |
| --- | --- | --- | --- | --- |
| 0 | 0 | u |  |  |
| 1-14 | 1-14 | u | `states` |  |
| 15 |  | u |  |  |
| 16 | 15 | s |  |  |

## `spell_effect`

1.1.4: 24 columns; 4.2.21: 28 columns.

| 1.1.4 | 4.2.21 | Type | Read as | Holds |
| --- | --- | --- | --- | --- |
| 0 | 0 | u |  | The effect id, and the row key. |
| 1 | 1 | u |  | A spell id (98% are spells), but the spell that lists the effect on only 1,306 of 6,712 rows. Not settled. |
| 2-3 | 2-3 | u |  | Empty in every build on hand. |
| 4 | 4 | u |  | 1 on 3,867 rows, 2 on 1,606, then 4, 6, 7. Not settled. |
| 5 | 5 | f |  | A float on 825 rows: 500, 1,000, 3,000. Not settled. |
| 6 | 6 | u | `kind` | 1 on an effect that lasts and 0 on one that acts at once: column 21 writes `Aura` and `Immediately` for the same rows, 6,710 of 6,712. |
| 7 | 7 | u | `detail` | What it does, as a number. Column 22 writes it out, but not one for one: 53 of the 89 pairs of columns 6 and 7 carry more than one wording. |
| 8 | 8 | i |  | The school: -1 none, 0 melee, 1 fire, 2 frost, 3 the one written `Biosome`, 4 energy, 5 holy, 6 shadow, 7 ranged, as column 23 writes them. |
| 9-10 | 9-10 | i |  | Signed amounts. Not settled. |
| 11 | 11 | u | `argument` | The number the effect does its work with. |
| 12 | 12 | u |  | 777 on 14 rows. Not settled. |
| 13-15 | 13-15 | u |  |  |
| 16-20 | 16-20 | u |  | Set on under 450 rows; 20 is bit flags. Not settled. |
| 21 | 21 | s |  | When it acts, written out: `Aura` or `Immediately`. |
| 22 | 22 | s | `label` | What it does, written out. |
| 23 | 23 | s |  | Its school, written out. |
|  | 24-27 | u |  | In 4.2.21, numbers up to 6 on under 200 rows. |

## `spell_new`

1.1.4: 53 columns; 1.0.0 to 1.1.1: 52 columns; 2.2.0: 55 columns; 2.5.0: 56 columns; 4.2.21: 74 columns.

| 1.1.4 | 1.0.0 to 1.1.1 | 2.2.0 | 2.5.0 | 4.2.21 | Type | Read as | Holds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | 0 | u |  | The spell id, and the row key. |
| 1 | 1 | 1 | 1 | 1 | u | `skillSet` | A `spell_skillset` key (1,247 of 1,248). |
| 2 | 2 | 2 | 2 | 2 | u |  | A `spellfilter` key, on every row. |
| 3 | 3 | 3 | 3 | 3 | s |  | A working name written in the row itself, spelt more roughly than the name in the string table. |
| 4 | 4 | 4 | 4 | 4 | u |  | Empty in every build on hand. |
| 5 | 5 | 5 | 5 | 5 | u | `nameString` | A `String_Spell` key: the name. |
| 6 | 6 | 6 | 6 | 6 | u | `rank` | The rank in its chain, 1 to 13. |
| 7 | 7 | 7 | 7 | 7 | u | `descriptionString` | A `String_Spell` key: the description. |
| 8-9 | 8-9 | 8-9 | 8-9 | 8-9 | u |  | 1 and 75, together, on 255 rows. Not settled. |
| 10 | 10 | 10 | 10 | 10 | s | `icon` | The icon file. |
| 11 | 11 | 11 | 11 | 11 | u |  | Empty in every build on hand. |
| 12 | 12 | 12 | 12 | 12 | i |  | -1 on 4,621 rows; 13, 14 or 15 on weapon skills. Not settled. |
| 13-14 | 13-14 | 13-14 | 13-14 | 13-14 | u |  | Bit masks, every bit set on most rows. Not settled. |
| 15 | 15 | 15 | 15 | 15 | u |  | 1 on 414 rows. Not settled. |
| 16 | 16 | 16 | 16 | 16 | u | `castMs` | The cast time in milliseconds. |
| 17 | 17 | 17 | 17 | 17 | u | `cooldownMs` | The cooldown in milliseconds. |
| 18-20 | 18-20 | 18-20 | 18-20 | 18-20 | f |  | Floats; column 19 is 20 or 25 on 380 rows. Not settled. |
| 21 | 21 | 21 | 21 | 21 | f | `range` | The range. |
| 22-24 | 22-24 | 22-24 | 22-24 | 22-24 | u |  | Small numbers on under 700 rows. Not settled. |
| 25 |  | 25 | 25 | 25 | u |  | A category: see `ftable.md`. |
| 26 | 25 | 26 | 26 | 26 | u | `visual` | A `c_spellvisual` key. |
| 27 | 26 | 27 | 27 | 27 | u |  | A spell id on 790 rows; 785 name a spell of the same name, 782 its first rank. |
| 28 | 27 | 28 | 28 | 28 | u |  | 1,000 on 2,319 rows, 1,500 on 1,459, 2,000 on 29. Not settled. |
| 29 | 28 | 29 | 29 | 29 | u |  | A spell id on 921 rows; 893 name a first rank, 820 of the same name. |
| 30 | 29 | 30 | 30 | 30 | u |  | 1 to 9 on 665 rows. Not settled. |
| 31-32 | 30-31 | 31-32 | 31-32 | 31-32 | u |  | Times in milliseconds: 3,000 to 30,000 on most rows that set 31, 1,000 to 5,000 on 32. Not settled. |
| 33-35 | 32-34 | 33-35 | 33-35 | 33-35 | u | `effects` | The ids of its first three effect rows. |
| 36-37 | 35-36 | 36-37 | 36-37 | 36-37 | u |  | Two more `spell_effect` keys, on 55 and 279 rows (486 and 1,051 in 4.2.21); every one is an effect row. The client does not read them. |
| 38 | 37 | 38 | 38 | 38 | u |  |  |
| 39 | 38 | 39 | 39 | 39 | f |  | A float, 10 to 30, on 304 rows. Not settled. |
| 40 | 39 | 40 | 40 | 40 | u |  | 1, 2 or 3, set on 786 of the 789 rows with a cost: what the cost is paid in. |
| 41 | 40 | 41 | 41 | 41 | u | `powerCost` | The cost. |
| 42 | 41 | 42 | 42 | 42 | u |  | 1 on 804 rows. Not settled. |
| 43 | 42 | 43 | 43 | 43 | u | `flags` | Bit flags; the client reads some. |
| 44-46 | 43-45 | 44-46 | 44-46 | 44-46 | u |  | Bit flags. Not settled. |
|  |  | 47-48 | 47-48 | 47-48 | u |  | Two columns from 2.2.0 on. Not settled. |
|  |  |  |  | 49-61 | u |  | In 4.2.21, thirteen columns of bit flags, set on a few hundred spells each. |
|  |  |  |  | 62-63 | u |  | In 4.2.21, empty. |
| 47-48 | 46-47 | 49-50 | 49-50 | 64-65 | u |  | Ids on 37 rows. Not settled. |
| 49 | 48 | 51 | 51 | 66 | u |  | 5,570,600 on 1,039 rows. Not settled. |
| 50 | 49 | 52 | 52 | 67 | u |  | 1 on 1,235 rows and 5 on 1,080. Not settled. |
| 51 | 50 | 53 | 53 | 68 | u |  | Empty in every build on hand. |
| 52 | 51 | 54 | 54 | 69 | u |  | An id on 24 rows. Not settled. |
|  |  |  | 55 | 70 | u |  | 0 or 1,000. |
|  |  |  |  | 71-73 | u |  | In 4.2.21, small numbers on a few dozen spells; the last runs 50 to 72 on about 1,000. Not settled. |

## `spell_skillset`

1.1.4: 3 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0-1 | u |  |  |
| 2 | s | `icon` |  |

## `spell_talent`

1.1.4: 16 columns; 1.1.5: 38 columns; 2.2.0 on: 42 columns.

| 1.1.4 | 1.1.5 | 2.2.0 on | Type | Read as | Holds |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | u | `id` |  |
| 1 | 1 | 1 | u | `tier` |  |
| 2 | 2 | 2 | u | `column` |  |
| 3 | 3 | 3 | u | `tree` |  |
| 4 | 4 | 4 | u | `requires` |  |
| 5 | 5 | 5 | u | `after` |  |
| 6-7 | 6-7 | 6-7 | u |  |  |
| 8 | 8 | 8 | u | `ranks` |  |
| 9 | 9 | 9 | u | `spells` |  |
|  | 10-13 | 10-13 | u |  |  |
| 10 | 14 | 14 | u | `spells` |  |
|  | 15-18 | 15-18 | u |  |  |
| 11 | 19 | 19 | u | `spells` |  |
|  | 20-23 | 20-23 | u |  |  |
| 12 | 24 | 24 | u | `spells` |  |
|  | 25-28 | 25-28 | u |  |  |
| 13 | 29 | 29 | u | `spells` |  |
|  | 30-33 | 30-33 | u |  |  |
| 14 | 34 | 34 | s | `icon` |  |
| 15 | 35 | 35 | u | `says` |  |
|  | 36-37 | 36-37 | u |  |  |
|  |  | 38-41 | u |  |  |

## `staticobject_displayinfo`

1.1.4: 19 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u |  |  |
| 1 | s | `path` |  |
| 2-6 | u |  |  |
| 7-12 | s | `effectNodes` |  |
| 13-18 | s | `effectFiles` |  |

## `staticobject_proto`

1.1.4: 20 columns; 1.0.0 to 1.0.3: 18 columns; 1.1.0 and 1.1.1: 19 columns.

| 1.1.4 | 1.0.0 to 1.0.3 | 1.1.0 and 1.1.1 | Type | Read as | Holds |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | u |  |  |
| 1 | 1 | 1 | u | `type` |  |
| 2 | 2 | 2 | u |  |  |
| 3 | 3 | 3 | u | `display` |  |
| 4-6 | 4-6 | 4-6 | u |  |  |
| 7 | 7 | 7 | f | `scale` |  |
| 8-17 | 8-17 | 8-17 | u |  |  |
| 18 |  |  | u |  |  |
| 19 |  | 18 | u | `festival` |  |

## `staticobject_spawns`

1.1.4: 16 columns; 1.0.0 to 1.0.3: 14 columns.

| 1.1.4 | 1.0.0 to 1.0.3 | Type | Read as | Holds |
| --- | --- | --- | --- | --- |
| 0 | 0 | u |  |  |
| 1 | 1 | u | `entry` |  |
| 2 | 2 | u | `map` |  |
| 3 | 3 | f | `x` |  |
| 4 | 4 | f | `y` |  |
| 5 | 5 | f | `z` |  |
| 6 | 6 | f |  |  |
| 7 | 7 | f | `yaw` |  |
| 8-10 | 8-10 | f u |  |  |
| 11 | 11 | f | `scale` |  |
| 12 |  | f | `scaleY` |  |
| 13 |  | f |  |  |
| 14-15 | 12-13 | u f |  |  |

## `storage_upgrade`

1.1.4: 7 columns; 2.5.0 on: 8 columns.

| 1.1.4 | 2.5.0 on | Type | Read as | Holds |
| --- | --- | --- | --- | --- |
| 0 | 0 | u |  |  |
| 1 | 1 | u | `storage` |  |
|  | 2 | u |  |  |
| 2 | 3 | u | `slots` |  |
| 3 | 4 | u | `currency` |  |
| 4 | 5 | u | `price` |  |
| 5 | 6 | u | `item` |  |
| 6 | 7 | u | `requires` |  |

## `t_bus_route`

1.1.4: 5 columns; 1.0.3 to 1.1.1: 4 columns; 4.2.21: 6 columns.

| 1.1.4 | 1.0.3 to 1.1.1 | 4.2.21 | Type | Read as | Holds |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | u |  |  |
| 1 | 1 | 1 | u | `from` |  |
| 2 | 2 | 2 | u | `to` |  |
| 3 | 3 | 3 | u | `price` |  |
| 4 |  | 4 | u |  |  |
|  |  | 5 | u |  |  |

## `teleport_spot`

1.1.4: 8 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u | `id` |  |
| 1 | s | `name` |  |
| 2 | u | `map` |  |
| 3 | f | `x` |  |
| 4 | f | `y` |  |
| 5 | f | `z` |  |
| 6 | f | `orientation` |  |
| 7 | u | `type` |  |

## `zones`

1.1.4: 36 columns; 1.0.0 to 1.0.3: 26 columns; 1.1.5: 37 columns; 2.2.0 on: 39 columns.

| 1.1.4 | 1.0.0 to 1.0.3 | 1.1.5 | 2.2.0 on | Type | Read as | Holds |
| --- | --- | --- | --- | --- | --- | --- |
| 0-1 | 0-1 | 0-1 | 0-1 | i |  |  |
| 2 | 2 | 2 | 2 | i | `parent` |  |
| 3 | 3 | 3 | 3 | u | `map` |  |
| 4 | 4 | 4 | 4 | f | `x1` |  |
| 5 | 5 | 5 | 5 | f |  |  |
| 6 | 6 | 6 | 6 | f | `z1` |  |
| 7 | 7 | 7 | 7 | f |  |  |
| 8 | 8 | 8 | 8 | f | `x2` |  |
| 9 | 9 | 9 | 9 | f |  |  |
| 10 | 10 | 10 | 10 | f | `z2` |  |
| 11 | 11 | 11 | 11 | f |  |  |
| 12 | 12 | 12 | 12 | u | `priority` |  |
| 13 | 13 | 13 | 13 | u | `fogColor` |  |
| 14 | 14 | 14 | 14 | f | `fogNear` |  |
| 15 | 15 | 15 | 15 | f | `fogFar` |  |
|  |  |  | 16-17 | f |  |  |
| 16 | 16 | 16 | 18 | u | `sunColor` |  |
| 17 | 17 | 17 | 19 | u | `shadeColor` |  |
| 18 | 18 | 18 | 20 | u | `music` |  |
| 19 | 19 | 19 | 21 | u | `ambience` |  |
| 20 | 20 | 20 | 22 | s | `skyDome` |  |
| 21 | 21 | 21 | 23 | s | `skyHill` |  |
| 22 |  | 22 | 24 | s | `skySun` |  |
| 23 |  | 23 | 25 | s |  |  |
| 24 |  | 24 | 26 | s | `skyHalo` |  |
| 25-31 |  | 25-31 | 27-33 | s f u |  |  |
| 32 | 22 | 32 | 34 | s | `icon` |  |
| 33-34 | 23-24 | 33-34 | 35-36 | i |  |  |
| 35 | 25 | 35 | 37 | i | `friendly` |  |
|  |  | 36 | 38 | u |  |  |

## `ZoneSpecialMusic`

1.1.4: 2 columns.

| 1.1.4 | Type | Read as | Holds |
| --- | --- | --- | --- |
| 0 | u | `zone` |  |
| 1 | u | `cue` |  |
