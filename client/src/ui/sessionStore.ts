/**
 * Leaving the world: back to the character list, or back to signing in.
 *
 * The screens ask; the game does the leaving. Nothing here knows about a
 * socket or a world, so a screen can offer both without reaching down.
 */

export interface SessionActions {
  /** Take the hero out of the world and show the account's characters. */
  backToCharacterList(): void;
  /** Leave the world and the account, back to the sign-in screen. */
  backToMainMenu(): void;
}

const NOTHING: SessionActions = {
  backToCharacterList: () => {},
  backToMainMenu: () => {},
};

let actions: SessionActions = NOTHING;

export function setSessionActions(next: SessionActions): void {
  actions = next;
}

export function sessionActions(): SessionActions {
  return actions;
}
