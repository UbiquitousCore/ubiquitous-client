/** Interface sheets kept per movie: movies reuse sheet names for different art. */

import type { UiMovie } from '../../assets/ids';
import type { UiSkinArt } from '../../assets/types';

export class MovieSheets {
  private readonly held = new Map<UiMovie, Map<string, UiSkinArt>>();

  /** One movie's sheets, made on first use. */
  of(movie: UiMovie): Map<string, UiSkinArt> {
    const there = this.held.get(movie);
    if (there) return there;
    const fresh = new Map<string, UiSkinArt>();
    this.held.set(movie, fresh);
    return fresh;
  }

  /** Which of those names this movie has not got yet. */
  missing(movie: UiMovie, names: Iterable<string>): string[] {
    const sheets = this.of(movie);
    const short: string[] = [];
    for (const name of names) if (!sheets.has(name)) short.push(name);
    return short;
  }

  /** A copy of one movie's sheets, for handing to whatever draws with them. */
  copyOf(movie: UiMovie): Map<string, UiSkinArt> {
    return new Map(this.of(movie));
  }
}
