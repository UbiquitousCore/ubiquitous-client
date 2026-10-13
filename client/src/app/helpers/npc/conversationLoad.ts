import type { GossipMenu } from '../../../assets/types';
import type { GossipContext } from '../../../ui/npcGossip';

/** Load one conversation menu page and the matching player context together. */
export async function loadConversationPage(args: {
  loadMenu: Promise<GossipMenu>;
  loadContext: Promise<GossipContext>;
}): Promise<{ menu: GossipMenu; context: GossipContext }> {
  const [menu, context] = await Promise.all([args.loadMenu, args.loadContext]);
  return { menu, context };
}
