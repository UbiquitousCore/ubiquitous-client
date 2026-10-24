/** The account's pre-world exchange with the server, each request made awaitable; sends only, the caller presents. */

import type { CharacterSummary, GameConnection, NewCharacter } from '../../../net/GameConnection';
import { waitOrFail, waitOrGiveUp, type Assign } from './waitFor';

type Sends = Pick<
  GameConnection,
  | 'login'
  | 'logout'
  | 'listCharacters'
  | 'createCharacter'
  | 'deleteCharacter'
  | 'chooseCharacter'
  | 'returnToCharacterList'
>;

export interface LoginAnswer {
  ok: boolean;
  code: number;
  reason: string | null;
}

export interface Answer {
  ok: boolean;
  reason: string | null;
}

export class AccountSession {
  /** The account's characters, as the server last listed them. */
  characters: CharacterSummary[] = [];
  /** The races the server opened with, or null where it did not say. */
  offeredRaces: number[] | null = null;
  /** Whether the signed-in account is a GM, as the server last said. */
  isAdmin = false;

  private listArrived: (() => void) | null = null;
  private entered: (() => void) | null = null;
  private returned: (() => void) | null = null;
  private signedOut: (() => void) | null = null;
  private failed: ((why: string) => void) | null = null;
  private pendingLogin: ((answer: LoginAnswer) => void) | null = null;
  private pendingCreate: ((answer: Answer) => void) | null = null;
  private pendingDelete: ((answer: Answer) => void) | null = null;

  /**
   * @param patienceMs how long to wait for a list the server sends of its
   *   own accord before carrying on with the last one.
   * @param onNoFreshList called when that wait runs out.
   */
  constructor(
    private readonly connection: Sends,
    private readonly patienceMs: number,
    private readonly onNoFreshList: () => void = () => {},
  ) {}

  // — what the server says --------------------------------------------------

  loginAnswered(
    ok: boolean,
    code: number,
    reason: string | null | undefined,
    isAdmin = false,
  ): void {
    this.isAdmin = ok && isAdmin;
    const pending = this.pendingLogin;
    this.pendingLogin = null;
    pending?.({ ok, code, reason: reason ?? null });
  }

  listed(characters: CharacterSummary[], races: number[] | null): void {
    this.characters = characters;
    this.offeredRaces = races;
    this.listArrived?.();
  }

  loggedOut(): void {
    this.signedOut?.();
    this.signedOut = null;
  }

  returnedToList(): void {
    this.returned?.();
    this.returned = null;
  }

  createAnswered(ok: boolean, code: number, reason: string | null | undefined): void {
    const pending = this.pendingCreate;
    this.pendingCreate = null;
    pending?.({ ok, reason: reason ?? (ok ? null : `code ${code}`) });
  }

  deleteAnswered(ok: boolean, code: number, reason: string | null | undefined): void {
    const pending = this.pendingDelete;
    this.pendingDelete = null;
    pending?.({ ok, reason: reason ?? (ok ? null : `code ${code}`) });
  }

  /**
   * The server's success path for picking a character sends nothing at all;
   * the next thing heard is the map load. So a message is always a refusal,
   * and waiting for the world would hang for ever.
   */
  chooseRefused(code: number, reason: string | null | undefined): void {
    this.failed?.(`the server refused that character (${reason ?? `code ${code}`})`);
  }

  /** The world was entered as a character. */
  worldEntered(): void {
    this.entered?.();
  }

  /**
   * Whatever was waited on can no longer be answered, so unblock it rather
   * than hang startup on a promise nobody can resolve.
   */
  disconnected(reason: string): void {
    this.failed?.(`disconnected: ${reason}`);
    const signingIn = this.pendingLogin;
    this.pendingLogin = null;
    signingIn?.({ ok: false, code: 0, reason: `Disconnected: ${reason}` });
  }

  /**
   * A refusal arrives as an error of its own rather than as the word the
   * screens are waiting for, so it is handed to whichever of signing in,
   * making and deleting a character is listening.
   */
  refuse(reason: string): void {
    const waiting = [this.pendingCreate, this.pendingDelete];
    this.pendingCreate = null;
    this.pendingDelete = null;
    for (const answer of waiting) answer?.({ ok: false, reason });
    const signingIn = this.pendingLogin;
    this.pendingLogin = null;
    signingIn?.({ ok: false, code: 0, reason });
  }

  // — what the player asks --------------------------------------------------

  /** The server allows a few refused attempts per connection, and none once signed in. */
  signIn(userId: string, passHash: string): Promise<LoginAnswer> {
    return new Promise(resolve => {
      this.pendingLogin = resolve;
      this.connection.login(userId, passHash);
    });
  }

  /** Sign out on the same connection, so the sign-in screen can be used again. */
  async signOut(): Promise<void> {
    const done = this.waitForAnswer(resolve => {
      this.signedOut = resolve;
    });
    this.connection.logout();
    await done;
    this.characters = [];
    this.offeredRaces = null;
    this.isAdmin = false;
  }

  /** Ask for the characters and wait for them. Rejects if the server refuses or hangs up. */
  async fetchCharacters(): Promise<CharacterSummary[]> {
    const arrived = this.waitForAnswer(resolve => {
      this.listArrived = resolve;
    });
    this.connection.listCharacters();
    await arrived;
    return this.characters;
  }

  /** The same, but carries on with the last list if a fresh one never comes. */
  async refreshCharacters(): Promise<CharacterSummary[]> {
    const arrived = this.waitForFreshList();
    this.connection.listCharacters();
    await arrived;
    return this.characters;
  }

  /**
   * Make a character. On success the fresh list has arrived by the time this
   * resolves; on refusal `characters` is untouched and the reason is given.
   */
  async create(wanted: NewCharacter): Promise<Answer> {
    const answered = new Promise<Answer>(resolve => {
      this.pendingCreate = resolve;
    });
    // Listened for before the asking: the list arrives on the server's own
    // initiative, perhaps in the same breath as the answer.
    const arrived = this.waitForFreshList();
    this.connection.createCharacter(wanted);
    const made = await answered;
    if (!made.ok) this.listArrived = null;
    else await arrived;
    return made;
  }

  /** Take a character off the account; the same shape as `create`. */
  async remove(nameOrGuid: string): Promise<Answer> {
    const answered = new Promise<Answer>(resolve => {
      this.pendingDelete = resolve;
    });
    const arrived = this.waitForFreshList();
    this.connection.deleteCharacter(nameOrGuid);
    const gone = await answered;
    if (!gone.ok) this.listArrived = null;
    else await arrived;
    return gone;
  }

  /** The character the list holds under that name or guid. */
  find(nameOrGuid: string): CharacterSummary | null {
    return this.characters.find(one => one.name === nameOrGuid || one.guid === nameOrGuid) ?? null;
  }

  /** Enter the world as a character. Resolves once entered; rejects if refused or the socket goes. */
  async choose(nameOrGuid: string): Promise<void> {
    const inWorld = this.waitForAnswer(resolve => {
      this.entered = resolve;
    });
    this.connection.chooseCharacter(nameOrGuid);
    await inWorld;
  }

  /** Leave the world for the list. Resolves when the server has taken the hero out. */
  async returnToList(): Promise<void> {
    const back = this.waitForAnswer(resolve => {
      this.returned = resolve;
    });
    this.connection.returnToCharacterList();
    await back;
  }

  private waitForAnswer(assign: Assign): Promise<void> {
    return waitOrFail(assign, fail => {
      this.failed = fail;
    });
  }

  private waitForFreshList(): Promise<void> {
    return waitOrGiveUp(
      resolve => {
        this.listArrived = resolve;
      },
      this.patienceMs,
      this.onNoFreshList,
    );
  }
}
