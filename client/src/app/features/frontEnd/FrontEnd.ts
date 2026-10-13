import type { CharacterSummary, GameConnection } from '../../../net/GameConnection';
import type { BootScreen } from '../../../ui/Hud';
import type { PlayableKinds } from '../../../assets/types';
import { mountFrontEnd, unmountFrontEnd } from '../../../ui/frontend/FrontEnd';
import {
  say,
  setCharacters,
  setFrontEndActions,
  setJustMade,
  setKinds,
  setStage,
  working,
} from '../../../ui/frontend/frontEndStore';
import { resourceForClass, setPlayer } from '../../../ui/hudStore';
import type { AccountSession } from './AccountSession';
import type { GroundStage } from './GroundStage';

/** What only the game around the screens can do or know. */
export interface FrontEndHost {
  /** The sign-in button was pressed. */
  signingIn(): void;
  /** The server refused the sign-in. */
  refused(why: string): void;
  /** The character about to be entered, or none if the name matched nobody. */
  chose(character: CharacterSummary | null): void;
  /** The races and classes the player's own copy of the game knows. */
  kinds(): Promise<PlayableKinds>;
}

/**
 * The screens before the world: sign in, make, delete and pick a character,
 * over the ground they stand on. A refusal returns to the asking screen.
 */
export class FrontEnd {
  /** Where the screens are mounted; null while none are. */
  private root: HTMLElement | null = null;
  private finished: (() => void) | null = null;

  constructor(
    private readonly account: AccountSession,
    private readonly ground: GroundStage,
    private readonly connection: Pick<GameConnection, 'askOutfit' | 'disconnect'>,
    private readonly boot: Pick<BootScreen, 'show' | 'hide'>,
    private readonly host: FrontEndHost,
  ) {}

  /**
   * Mount the screens on an overlay of their own. Resolves when a character
   * is chosen; the screens stay up until `close`.
   */
  open(): Promise<void> {
    const done = new Promise<void>(resolve => {
      this.finished = resolve;
    });
    if (!this.root) {
      // The opaque boot panel would cover the ground; it returns for the zone load.
      this.boot.hide();
      const root = document.createElement('div');
      root.dataset.screen = 'front-end-root';
      document.body.append(root);
      this.root = root;
      mountFrontEnd(root);
    }
    return done;
  }

  close(): void {
    this.boot.show('Entering the world...');
    if (this.root) {
      unmountFrontEnd(this.root);
      this.root.remove();
      this.root = null;
    }
    this.ground.dispose();
  }

  private finish(): void {
    this.finished?.();
    this.finished = null;
  }

  /** The screens' buttons: each a request to the server, a refusal returning to the asking screen. */
  installActions(): void {
    setFrontEndActions({
      signIn: async (userId, passHash) => {
        this.host.signingIn();
        working(true);
        say('Signing in...');
        /*
         * ONE LOGIN ATTEMPT PER CONNECTION. The server kills a session that
         * logs in twice, so re-offering the form turns a wrong password into
         * an unexplained disconnect. Retrying means reloading.
         */
        const login = await this.account.signIn(userId, passHash);
        if (!login.ok) {
          const why = login.reason ?? `code ${login.code}`;
          this.host.refused(why);
          say(`Sign-in refused (${why}). Reload to try again.`);
          // Left working: this connection cannot carry a second attempt.
          return;
        }

        setCharacters(await this.account.fetchCharacters());
        // What a race and a class *are* comes from the player's own copy of
        // the game, like every other look. Which of them may be played is
        // the server's to say: a build ships rows and art for races it was
        // never opened with, and the mounted files cannot tell which.
        const carried = await this.host.kinds().catch(() => ({ races: [], classes: [] }));
        const opened = this.account.offeredRaces;
        setKinds(
          opened === null
            ? carried
            : { ...carried, races: carried.races.filter(one => opened.includes(one.race)) },
        );
        working(false);
        setStage('characters');
      },

      create: async wanted => {
        working(true);
        say('Making the character...');
        const made = await this.account.create({
          name: wanted.name.trim(),
          race: wanted.race,
          class: wanted.playerClass,
          gender: wanted.gender,
          appearance: {
            skin: wanted.skin,
            hairStyle: wanted.hairStyle,
            hairColour: wanted.hairColour,
            face: wanted.face,
          },
        });
        if (!made.ok) {
          working(false);
          say(made.reason ?? 'That character could not be made.');
          return;
        }
        setCharacters(this.account.characters);
        // The list opens on the character just made, as the build does.
        setJustMade(wanted.name.trim());
        this.ground.celebrate();
        working(false);
        setStage('characters');
      },

      remove: async nameOrGuid => {
        working(true);
        say('Deleting...');
        const gone = await this.account.remove(nameOrGuid);
        if (!gone.ok) {
          working(false);
          say(gone.reason ?? 'That character could not be deleted.');
          return;
        }
        setCharacters(this.account.characters);
        void this.ground.show(null);
        working(false);
        say('');
      },

      choose: async nameOrGuid => {
        working(true);
        say('Entering the world...');
        const character = this.account.find(nameOrGuid);
        this.host.chose(character);
        if (character) {
          setPlayer({
            id: 'player',
            name: character.name,
            level: character.level,
            health: 0,
            maxHealth: 0,
            mana: 0,
            maxMana: 0,
            disposition: 'friendly',
            resource: resourceForClass(character.class),
          });
        }
        await this.account.choose(nameOrGuid);
        setStage('entering');
        working(false);
        this.finish();
      },

      celebrate: () => this.ground.celebrate(),

      // The server takes one sign-in per connection, so sign-in needs a fresh page.
      signOut: () => {
        this.connection.disconnect();
        window.location.reload();
      },

      preview: look => void this.ground.show(look),
      askOutfit: (race, playerClass) => this.connection.askOutfit(race, playerClass),
      wantPortrait: look => void this.ground.portrait(look),
      stageCanvas: canvas => this.ground.canvas(canvas),
      turnBody: radians => this.ground.turnBy(radians),
      releaseBody: () => this.ground.releaseTurn(),
      watchGround: view => this.ground.watch(view),
    });
  }
}
