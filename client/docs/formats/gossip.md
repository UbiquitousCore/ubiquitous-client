# NPC conversations (`chat_menu` and `String_Menu`)

A conversation is a set of pages. Each page is one `chat_menu` row. The row
names a string in the `String_Menu_<language>` table, and that string holds
both what the page says and the choices that can be said back. This page
describes the layout, worked out by reading every row and string in the
user's own 1.1.4 and 2.2.0 tables. Tag and attribute names are data from the
tables; the other names here are this document's own.

## Where a conversation starts

`creature_proto` column 56 names the `chat_menu` row a creature greets a
player with, or 0 for none. It is set on every creature with the talk bit
(bit 0 of column 11).

## The row

| Column | Holds                                                 |
| ------ | ----------------------------------------------------- |
| 0      | The row's own id.                                     |
| 1      | The id of the page's string in `String_Menu`.         |
| 2-7    | Six script ids, one per choice slot, 0 where unset.   |
| 8-13   | Six sub-page ids, rows of `chat_menu`, 0 where unset. |

The columns are slots, not choices. Which slots a page uses, and in what
order its choices appear, is decided by the markup in the string.

## The markup

A tag opens with byte `0x12` and closes with byte `0x13`:

    0x12 name[=value[,key=value…]] 0x13   …   0x12 /name 0x13

The `>` character plays no part. `0x12 0x13` with nothing between is empty
and means nothing. A few strings put words between `0x12` and `0x13` that are
not a tag (they contain spaces); those are words. Line breaks are `\n`, and
some 1.1.4 strings use `\r\n`.

| Tag                                                             | Closed?    | Meaning                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link_menu=K,icon=…,script=S`                                   | yes        | One choice; its label is what the tag wraps. K from 1 to 6 opens the page in sub-page column K, when that column is set. K = 0 and K = -1 open no sub-page; most K = 0 choices are an invitation to hear more, and are followed by other choices on the same page. `script=S`, when present and from 1 to 6, is the script slot the choice runs; `script=-1` is none. |
| `script=S`                                                      | yes        | Inside a `link_menu`, another way to give the choice script slot S; it wraps the label.                                                                                                                                                                                                                                                                               |
| `teleport=K,topzone=Z,x=…,y=…,z=…,o=…,moneytype=T,moneycount=C` | yes, empty | A teleport sold by the choice whose script slot is K on the same page: zone Z, the position to arrive at (y is height) and the facing. `moneytype` 0 is the currency vendor tabs and storage upgrades price in. A tag with no `moneytype` and `moneycount` is free.                                                                                                   |
| `has_quest=N`                                                   | yes        | What it wraps shows only while the player has quest N. One form adds `,inlog=1`.                                                                                                                                                                                                                                                                                      |
| `not_has_quest=N`                                               | yes        | What it wraps shows only while the player does not have quest N.                                                                                                                                                                                                                                                                                                      |
| `has_aura=N` / `not_has_aura=N`                                 | yes        | The same, for an aura of spell N on the player.                                                                                                                                                                                                                                                                                                                       |
| `random`                                                        | yes        | Wraps several `randomtext` tags. One of them is said.                                                                                                                                                                                                                                                                                                                 |
| `randomtext`                                                    | yes        | One line a `random` may say.                                                                                                                                                                                                                                                                                                                                          |
| `color=red`                                                     | yes        | The words it wraps are coloured. `red` is the only value in either build.                                                                                                                                                                                                                                                                                             |
| `name`, `class`, `race`                                         | no         | The player's name, class and race.                                                                                                                                                                                                                                                                                                                                    |
| `br /`                                                          | no         | A line break.                                                                                                                                                                                                                                                                                                                                                         |

Every `teleport` tag in both builds sits outside every condition, and each
pairs with exactly one `link_menu` carrying the matching `script=`. A
teleport choice's script column is sometimes 0; the tag, not the column,
carries the destination.

## What does not line up

These are features of the data. A reader has to put up with them:

- A closer with no opener (a `/link_menu` before any `link_menu`; a
  `/randomtext` more than there are `randomtext` openers).
- A `link_menu` never closed, which runs to the end of the string.
- A `link_menu=1,` with no label and nothing under it.
- A `link_menu=K` whose sub-page column K is 0, sometimes with a script and
  sometimes without.
- A choice naming a script slot whose column is 0 and that sells no teleport.
  `realPacks.test.ts` pins how many there are per build.
- A sub-page column set on a row that no `link_menu` on the page points at.
- Rows whose string is absent from every language, or present and empty.
