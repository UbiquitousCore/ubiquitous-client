import { logger } from '../core/log';
/**
 * Game — application lifecycle and the frame loop.
 *
 * This is the only place that knows every subsystem exists. Wiring lives here
 * so nothing deeper has to reach sideways for a dependency.
 */

import { ResourceSystem } from '../assets/ResourceSystem';
import { resolveItemWords } from './itemLookups';
import { setEmblems, setMovie, setPieces, takeUiWords } from '../ui/art/pieceStore';
import type { WantedDialog } from '../ui/art/pieceStore';
import { askOnce } from '../core/askOnce';
import { registerFaces } from '../core/lettering';
import { planPiece, planArt } from '../ui/art/piecePlan';
import { drawPiece } from '../ui/art/pieceCanvas';
import { MovieSheets } from '../ui/art/movieSheets';
import type { PieceImage } from '../ui/art/pieceCanvas';
import type { UiSkinData } from '../assets/types';
import type { UiMovie } from '../assets/ids';
import type { InventoryItem } from '../net/GameConnection';
import {
  setItemText,
  setItemIcon,
  setItemFacts,
  setItemName,
  setSpellText,
} from '../ui/inventoryStore';
import { CLASS_IDS, TOPBAR_ICON_NAMES, setClassIcon, setTopbarIcon } from '../ui/topbarIconStore';
import { cutToBlobUrl, cutUiSprites, setUiSprites } from '../ui/art/uiSprites';
import { setSpellName, setSpellIcon, setSpellStats, setTalentWord } from '../gameplay/SpellBook';
/** The movie the game itself is drawn from; the screens before it have their own. */
const IN_GAME: UiMovie = 'IGM';

const log = logger('ui-art');

/** The interface's pictures, words and typefaces, each asked for once. */
export class UiArt {
  constructor(private readonly resources: ResourceSystem) {}

  /** All target-toolbar icons, once: at most eight, and none changes. */
  resolveTopbarIcons(): void {
    for (const name of TOPBAR_ICON_NAMES) {
      void this.resources
        .topbarIcon(name)
        .then(icon => {
          if (icon) setTopbarIcon(name, icon);
        })
        .catch(() => {});
    }
    for (const classId of CLASS_IDS) {
      void this.resources
        .classIcon(classId)
        .then(icon => {
          if (icon) setClassIcon(classId, icon);
        })
        .catch(() => {});
    }
  }

  /** Cut the interface's small pictures out of the user's sheets; missing ones keep their fallback. */
  resolveUiSprites(): void {
    void cutUiSprites(
      movie => this.resources.uiSkin(movie),
      (sheet, movie) => this.resources.uiIcon(sheet, movie),
      cutToBlobUrl,
    )
      .then(setUiSprites)
      .catch(() => {});
  }

  /** An inspected player's worn items' names and pictures. */
  resolveInspectArt(equipment: readonly number[]): void {
    for (const entry of equipment) {
      if (!entry) continue;
      this.resolveLootArt(entry);
      void this.resources
        .itemFacts(entry)
        .then(facts => {
          if (!facts) return;
          setItemFacts(entry, facts);
          void resolveItemWords(facts, this.resources);
        })
        .catch(() => {});
    }
  }

  resolveLootArt(entry: number): void {
    void this.resources
      .itemFacts(entry)
      .then(facts => {
        if (facts) setItemFacts(entry, facts);
      })
      .catch(() => {});
    void this.resources
      .itemName(entry)
      .then(name => {
        if (name) setItemName(entry, name);
      })
      .catch(() => {});
    void this.resources
      .itemIcon(entry)
      .then(icon => {
        if (icon) setItemIcon(entry, icon);
      })
      .catch(() => {});
  }

  private readonly askUiMovie = new Map<UiMovie, () => Promise<UiSkinData | null>>();
  private readonly uiArt = new MovieSheets();
  private readonly uiDrawn = new Set<string>();

  /**
   * Draw the interface pieces a screen asked for. The movie is parsed once;
   * a build without it publishes nothing and screens keep their own styling.
   */
  async drawUiPieces(names: readonly string[]): Promise<void> {
    const fresh = names.filter(name => !this.uiDrawn.has(name));
    if (!fresh.length) return;
    const skin = await this.warmUiMovie();
    if (!skin) return;
    const sheets = this.uiArt.of(IN_GAME);
    for (const name of fresh) this.uiDrawn.add(name);
    const drawn = new Map<string, PieceImage>();
    for (const name of fresh) {
      const plan = planPiece(skin, name);
      if (!plan) continue;
      for (const art of planArt(plan)) {
        if (sheets.has(art)) continue;
        const bitmap = await this.resources.uiIcon(art, IN_GAME).catch(() => null);
        if (bitmap) sheets.set(art, bitmap);
      }
      const image = drawPiece(plan, sheets, 1);
      if (image) drawn.set(name, image);
    }
    if (drawn.size) setPieces(drawn);
  }

  private readonly uiDialogsLoaded = new Set<string>();
  private askUiWords?: () => Promise<readonly string[] | null>;

  /** Read the interface words once, retrying after a failed read. */
  private wantUiWords(): void {
    this.askUiWords ??= askOnce(() => this.resources.uiStrings().then(takeUiWords));
    void this.askUiWords();
  }

  /**
   * The interface movie, read once on entering the world, before any screen
   * needs it. A failed read (nothing mounted yet) is retried by `askOnce`.
   */
  private warmUiMovie(movie: UiMovie = IN_GAME): Promise<UiSkinData | null> {
    let ask = this.askUiMovie.get(movie);
    if (!ask) {
      ask = askOnce(() => this.resources.uiSkin(movie));
      this.askUiMovie.set(movie, ask);
    }
    this.wantUiWords();
    return ask();
  }

  private readonly uiEmblemsAsked = new Set<string>();
  private readonly spellIconsAsked = new Set<number>();
  private readonly talentWordsAsked = new Set<number>();

  /** Register the interface's own typefaces; the font tokens pick them up by name. */
  async loadUiFaces(): Promise<void> {
    const faces = await this.resources.uiFaces();
    if (!faces.body && !faces.title) {
      log.info('interface lettering: this build ships no typeface its movies name');
      return;
    }
    const took = await registerFaces(faces);
    log.info(
      `interface lettering: ${took ? 'drawn in' : 'could not read'} ` +
        [faces.body?.family, faces.title?.family].filter(Boolean).join(' and '),
    );
  }

  /** Icons a screen draws itself; a name that answers nothing draws nothing. */
  async loadUiEmblems(names: readonly string[]): Promise<void> {
    const fresh = names.filter(name => !this.uiEmblemsAsked.has(name));
    if (!fresh.length) return;
    for (const name of fresh) this.uiEmblemsAsked.add(name);
    const found = new Map<string, ImageBitmap>();
    await Promise.all(
      fresh.map(name =>
        this.resources
          .uiIcon(name)
          .then(art => {
            if (art) found.set(name, art.image);
          })
          .catch(() => {}),
      ),
    );
    if (found.size) setEmblems(found);
  }

  async loadTalentWords(ids: readonly number[]): Promise<void> {
    const fresh = ids.filter(id => !this.talentWordsAsked.has(id));
    if (!fresh.length) return;
    for (const id of fresh) this.talentWordsAsked.add(id);
    await Promise.all(
      fresh.map(id =>
        this.resources
          .spellString(id)
          .then(said => {
            if (said) setTalentWord(id, said);
          })
          .catch(() => {}),
      ),
    );
  }

  private readonly spellStatsAsked = new Set<number>();

  /** A spell's figures and what it does, for the card the spell book opens. */
  async loadSpellStats(ids: readonly number[]): Promise<void> {
    const fresh = ids.filter(id => !this.spellStatsAsked.has(id));
    for (const id of fresh) this.spellStatsAsked.add(id);
    await Promise.all(
      fresh.flatMap(id => [
        this.resources
          .spellStats(id)
          .then(stats => setSpellStats(id, stats))
          .catch(() => {}),
        this.resources
          .spellText(id)
          .then(text => {
            if (text) setSpellText(id, text);
          })
          .catch(() => {}),
      ]),
    );
  }

  /** Picture, name and words for a spell nobody has learned. */
  async loadSpellDetails(ids: readonly number[]): Promise<void> {
    const fresh = ids.filter(id => !this.spellIconsAsked.has(id));
    if (!fresh.length) return;
    for (const id of fresh) this.spellIconsAsked.add(id);
    await Promise.all(
      fresh.flatMap(id => [
        this.resources
          .spellIcon(id)
          .then(icon => {
            if (icon) setSpellIcon(id, icon);
          })
          .catch(() => {}),
        this.resources
          .spellName(id)
          .then(name => {
            if (name) setSpellName(id, name);
          })
          .catch(() => {}),
        this.resources
          .spellText(id)
          .then(text => {
            if (text) setSpellText(id, text);
          })
          .catch(() => {}),
      ]),
    );
  }

  /** Publish a whole interface movie with the art the named dialogs need. */
  async loadUiDialogs(wanted: readonly WantedDialog[]): Promise<void> {
    for (const movie of new Set(wanted.map(one => one.movie))) {
      await this.loadUiDialogsOf(
        movie,
        wanted.filter(one => one.movie === movie).map(one => one.dialog),
      );
    }
  }

  private async loadUiDialogsOf(movie: UiMovie, names: readonly string[]): Promise<void> {
    const skin = await this.warmUiMovie(movie);
    // Marked only once there is a movie, or a dialog asked for before mounting
    // would never be asked for again.
    if (!skin) {
      if (names.length) {
        log.info(
          `interface art: no ${movie} movie to draw ${names.length} screen(s) from yet — ` +
            'asked again once the build is mounted',
        );
      }
      return;
    }
    const fresh = names.filter(name => !this.uiDialogsLoaded.has(`${movie}/${name}`));
    if (!fresh.length) return;
    for (const name of fresh) this.uiDialogsLoaded.add(`${movie}/${name}`);
    // Every sheet at once, not one round trip each.
    const sheets = this.uiArt.of(movie);
    const wanted = new Set<string>();
    for (const name of fresh) {
      const plan = planPiece(skin, name, { includeParked: true });
      for (const art of this.uiArt.missing(movie, plan ? planArt(plan) : [])) wanted.add(art);
    }
    await Promise.all(
      [...wanted].map(art =>
        this.resources
          .uiIcon(art, movie)
          .then(bitmap => {
            if (bitmap) sheets.set(art, bitmap);
          })
          .catch(() => {}),
      ),
    );
    setMovie({ skin, art: this.uiArt.copyOf(movie) }, movie);
    log.info(`interface art: ${movie} ${fresh.join(', ')} ready`);
  }

  /** An item's name and icon from local data, cached by entry. */
  resolveItemArt(item: InventoryItem): void {
    void this.resources
      .itemName(item.entry)
      .then(name => {
        if (name) setItemName(item.entry, name);
      })
      .catch(() => {});
    void this.resources
      .itemFacts(item.entry)
      .then(facts => {
        if (!facts) return;
        setItemFacts(item.entry, facts);
        void resolveItemWords(facts, this.resources);
      })
      .catch(() => {});
    const description = item.prototype.descriptionStringId;
    if (description) {
      void this.resources
        .itemText(description)
        .then(text => {
          if (text) setItemText(description, text);
        })
        .catch(() => {});
    }
    void this.resources
      .itemIcon(item.entry)
      .then(icon => {
        if (icon) setItemIcon(item.entry, icon);
      })
      .catch(() => {});
  }
}
