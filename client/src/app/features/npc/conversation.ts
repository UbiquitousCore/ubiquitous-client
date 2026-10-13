import type { ResourceSystem } from '../../../assets/ResourceSystem';
import type { GossipMenu } from '../../../assets/types';
import { logger } from '../../../core/log';
import type {
  CharacterSummary,
  ConnectionEvents,
  GameConnection,
} from '../../../net/GameConnection';
import { auraKey, aurasFor } from '../../../ui/auraStore';
import { closeGossip, showGossip } from '../../../ui/hudStore';
import { choiceNotice, classWord, closesAfter, readGossip } from '../../../ui/npcGossip';
import type { GossipChoice as ConversationChoice, GossipContext } from '../../../ui/npcGossip';
import { questLog } from '../../../ui/questStore';
import type { WhoIs } from '../../WhoIs';
import { conversationFailureView } from '../../helpers/npc/conversationFailureView';
import { loadConversationPage } from '../../helpers/npc/conversationLoad';
import { buildGossipContextData } from '../../helpers/npc/gossipContextData';
import { buildGossipWindow } from '../../helpers/npc/gossipWindow';
import { isResultOfPick } from '../../helpers/npc/pickedChoice';

const log = logger('conversation');

/** A choice the player picked whose script the server is running, until it answers. */
interface Picked {
  networkId: number;
  menuId: number;
  choice: ConversationChoice;
}

/**
 * An NPC's conversation: its pages, walked locally from the user's own
 * tables, and the choices whose scripts the server runs. What a page says
 * depends on the hero: their name, class and race, quests held and auras worn.
 */
export class Conversation {
  private picked: Picked | null = null;

  constructor(
    private readonly connection: Pick<GameConnection, 'sendNpcPickOption' | 'sendNpcPreviousPage'>,
    private readonly resources: Pick<
      ResourceSystem,
      'npcGreeting' | 'gossipMenu' | 'playableKinds'
    >,
    private readonly whoIs: Pick<WhoIs, 'networkName' | 'selfNetworkId'>,
    /** The character being played, or null before one is chosen. */
    private readonly hero: () => CharacterSummary | null,
    /** The notice line in chat. */
    private readonly say: (text: string | null) => void,
  ) {}

  /** The server opened a conversation with this body: show its greeting. */
  open(networkId: number, entry: number): void {
    this.openPage(networkId, [], this.resources.npcGreeting(entry), `greeting of ${entry}`);
  }

  handlers(): Partial<ConnectionEvents> {
    return {
      onNpcChoiceResult: (networkId, menuId, choice, result) => {
        const picked = this.picked;
        const mine = isResultOfPick(picked, networkId, menuId, choice);
        if (mine) this.picked = null;
        if (closesAfter(result)) closeGossip();
        this.say(choiceNotice(result, mine && picked ? picked.choice : null));
      },
    };
  }

  private speakerName(networkId: number): string {
    return this.whoIs.networkName(networkId) || 'NPC';
  }

  private async context(): Promise<GossipContext> {
    const kinds = await this.resources.playableKinds().catch(() => ({ races: [], classes: [] }));
    return buildGossipContextData({
      character: this.hero(),
      kinds,
      classWord,
      holdsQuest: id => questLog.peek().some(quest => quest.id === id),
      hasAura: id =>
        aurasFor(auraKey(this.whoIs.selfNetworkId())).some(aura => aura.spellId === id),
      random: Math.random,
    });
  }

  private openPage(
    networkId: number,
    trail: readonly GossipMenu[],
    load: Promise<GossipMenu>,
    what: string,
  ): void {
    void loadConversationPage({ loadMenu: load, loadContext: this.context() })
      .then(({ menu, context }) => this.show(networkId, [...trail, menu], context))
      .catch(error => this.failed(networkId, what, error));
  }

  /**
   * One page of an NPC's conversation; `trail` is every menu from the
   * greeting down. Walking the menus needs no server.
   */
  private show(networkId: number, trail: readonly GossipMenu[], context: GossipContext): void {
    const menu = trail[trail.length - 1]!;
    const page = readGossip(menu, context);
    showGossip(
      buildGossipWindow({
        title: this.speakerName(networkId),
        page,
        trailMenuIds: trail.map(one => one.id),
        onOpen: menuId =>
          this.openPage(networkId, trail, this.resources.gossipMenu(menuId), `menu ${menuId}`),
        onClose: () => closeGossip(),
        onRun: (slot, choice) => {
          this.picked = { networkId, menuId: menu.id, choice };
          this.connection.sendNpcPickOption(networkId, menu.id, slot);
        },
        onBackUp: () => this.show(networkId, trail.slice(0, -1), context),
        onBackOut: () => closeGossip(),
      }),
    );
  }

  private failed(networkId: number, what: string, error: unknown): void {
    showGossip(
      conversationFailureView(this.speakerName(networkId), () =>
        this.connection.sendNpcPreviousPage(networkId),
      ),
    );
    log.warn(`conversation ${what} failed: ${String(error)}`);
  }
}
