/**
 * Every screen a consumer asks for by name, gathered from the consumers.
 *
 * The screens that wear the game's own art each export our name for
 * themselves; this lists them all, so the gallery and the wiring test can
 * both say, for each one, whether it is drawn from the movie or why not.
 * A screen added without being listed here is a screen nobody checks.
 */

import {
  TEAM_ASK_SCREEN,
  TRADE_ASK_SCREEN,
  DUEL_ASK_SCREEN,
  TRAVEL_ASK_SCREEN,
  VOTE_KICK_ASK_SCREEN,
  SUMMON_ASK_SCREEN,
} from '../src/ui/AskPromptContainer';
import { CHARACTERS_SCREEN } from '../src/ui/frontend/ArtChooseCharacter';
import { DELETE_SCREEN } from '../src/ui/frontend/ArtConfirmDelete';
import { SIGN_IN_SCREEN } from '../src/ui/frontend/ArtSignIn';
import { ABOUT_SCREEN } from '../src/ui/frontend/ArtAbout';
import {
  CLASS_SCREEN,
  LOOK_SCREEN,
  NAME_SCREEN,
  RACE_SCREEN,
} from '../src/ui/frontend/ArtMakeCharacter';
import { ITEM_LIST_SCREEN } from '../src/ui/components/ArtItemListWindow';
import { CHAT_PEEK_SCREEN } from '../src/ui/components/ArtChatPeek';
import { CHAT_SAY_SCREEN, CHAT_SCREEN } from '../src/ui/components/ArtChatBar';
import { LOOT_SCREEN } from '../src/ui/components/ArtLootWindow';
import { SPLIT_SCREEN } from '../src/ui/components/ArtSplitWindow';
import { PLAYER_FRAME_SCREEN } from '../src/ui/components/ArtPlayerFrame';
import { FITTING_ROOM_SCREEN } from '../src/ui/components/ArtTryOn';
import { HELD_CARD } from '../src/ui/components/ArtItemCard';
import { MAIL_READ_SCREEN, MAIL_SCREEN } from '../src/ui/components/ArtMailWindow';
import { PLAYER_LINK_SCREEN } from '../src/ui/components/ArtPlayerLinkMenu';
import { QUEST_LOG_SCREEN } from '../src/ui/components/ArtQuestLogWindow';
import { TARGET_FRAME_SCREEN } from '../src/ui/components/ArtFocusPanel';
import { CAST_BAR_SCREEN } from '../src/ui/components/ArtCastBar';
import { JUMP_SCREEN } from '../src/ui/components/ArtJumpButton';
import { SPELL_BAR_SCREEN } from '../src/ui/components/ArtSpellBar';
import { SPELL_WHEEL_SCREEN } from '../src/ui/components/ArtSpellWheel';
import { AREA_MAP_SCREEN, WORLD_MAP_SCREEN } from '../src/ui/components/ArtMapWindow';
import { MINIMAP_SCREEN } from '../src/ui/components/ArtMinimap';
import {
  BAG_ASK_SCREEN,
  BAG_SCREEN,
  BAG_SHORT_SCREEN,
  DISCARD_ASK_SCREEN,
} from '../src/ui/components/ArtBagWindow';
import { STORAGE_SCREEN } from '../src/ui/components/ArtStorageWindow';
import { SAID_SCREEN } from '../src/ui/components/ArtChatSaid';
import { QUEST_SCREEN } from '../src/ui/components/ArtQuestWindow';
import { ROW_MENU_SCREEN } from '../src/ui/components/ArtRowMenu';
import { CHARACTER_SCREEN } from '../src/ui/components/ArtCharacterWindow';
import { TALENT_CARD_SCREEN } from '../src/ui/components/ArtTalentCard';
import { SPELL_CARD_SCREEN } from '../src/ui/components/ArtSpellCard';
import { TALENTS_SCREEN } from '../src/ui/components/ArtTalentsWindow';
import { OPTIONS_SCREEN } from '../src/ui/components/ArtOptionsWindow';
import { MENU_SCREEN } from '../src/ui/components/ArtMenuBar';
import { SHOP_SCREEN } from '../src/ui/components/ArtShopWindow';
import { SOCIAL_SCREEN } from '../src/ui/components/ArtSocialWindow';
import { TEAM_SCREEN } from '../src/ui/components/ArtTeamWindow';
import { TRADE_SCREEN } from '../src/ui/components/ArtTradeWindow';
import {
  MAIL_ATTACH_SCREEN,
  MAIL_BAG_SCREEN,
  MAIL_MONEY_SCREEN,
  MAIL_WRITE_SCREEN,
} from '../src/ui/components/ArtMailWriteWindow';
import { TOPBAR_MENU_SCREEN } from '../src/ui/components/ArtTopbarMenu';
import { SELL_SCREEN } from '../src/ui/components/ArtSellWindow';
import { NPC_CHAT_SCREEN } from '../src/ui/components/ArtNpcChatWindow';
import { SPELLS_SCREEN } from '../src/ui/components/ArtSpellsWindow';
import { QUEST_ASK_SCREEN } from '../src/ui/components/ArtQuestAskWindow';
import { TEAM_FRAMES_SCREEN } from '../src/ui/components/ArtTeamFrames';
import { AURA_ICON_SCREEN } from '../src/ui/components/AuraRow';
import { AURA_CARD_SCREEN } from '../src/ui/components/AuraCard';
import { SUMMON_SCREEN } from '../src/ui/components/ArtSummonWindow';

/**
 * The screens with no constant of their own: the auction house names
 * itself in private, the item card for what is worn is chosen inside the
 * card, and the words a duel asks with are read by the game.
 */
const UNEXPORTED = ['auction', 'equipped', 'duelWords'] as const;

export const KNOWN_SCREENS: readonly string[] = [
  ...UNEXPORTED,
  TEAM_ASK_SCREEN,
  VOTE_KICK_ASK_SCREEN,
  TRADE_ASK_SCREEN,
  DUEL_ASK_SCREEN,
  TRAVEL_ASK_SCREEN,
  SUMMON_ASK_SCREEN,
  CHARACTERS_SCREEN,
  DELETE_SCREEN,
  SIGN_IN_SCREEN,
  ABOUT_SCREEN,
  RACE_SCREEN,
  CLASS_SCREEN,
  LOOK_SCREEN,
  NAME_SCREEN,
  ITEM_LIST_SCREEN,
  CHAT_PEEK_SCREEN,
  CHAT_SCREEN,
  CHAT_SAY_SCREEN,
  LOOT_SCREEN,
  PLAYER_FRAME_SCREEN,
  FITTING_ROOM_SCREEN,
  HELD_CARD,
  MAIL_SCREEN,
  MAIL_READ_SCREEN,
  PLAYER_LINK_SCREEN,
  QUEST_LOG_SCREEN,
  TARGET_FRAME_SCREEN,
  CAST_BAR_SCREEN,
  JUMP_SCREEN,
  SPELL_BAR_SCREEN,
  SPELL_WHEEL_SCREEN,
  MINIMAP_SCREEN,
  AREA_MAP_SCREEN,
  WORLD_MAP_SCREEN,
  BAG_SCREEN,
  BAG_ASK_SCREEN,
  BAG_SHORT_SCREEN,
  DISCARD_ASK_SCREEN,
  SPLIT_SCREEN,
  STORAGE_SCREEN,
  SAID_SCREEN,
  QUEST_SCREEN,
  ROW_MENU_SCREEN,
  CHARACTER_SCREEN,
  TALENT_CARD_SCREEN,
  SPELL_CARD_SCREEN,
  TALENTS_SCREEN,
  OPTIONS_SCREEN,
  MENU_SCREEN,
  SHOP_SCREEN,
  SOCIAL_SCREEN,
  TEAM_SCREEN,
  TRADE_SCREEN,
  MAIL_WRITE_SCREEN,
  MAIL_MONEY_SCREEN,
  MAIL_BAG_SCREEN,
  MAIL_ATTACH_SCREEN,
  TOPBAR_MENU_SCREEN,
  SELL_SCREEN,
  NPC_CHAT_SCREEN,
  SPELLS_SCREEN,
  QUEST_ASK_SCREEN,
  TEAM_FRAMES_SCREEN,
  AURA_ICON_SCREEN,
  AURA_CARD_SCREEN,
  SUMMON_SCREEN,
];
