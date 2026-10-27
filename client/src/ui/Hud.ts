/** A text overlay reading a snapshot; touches nothing else, so it is disposable. */

import { SUPPORTED_VERSIONS, UNSUPPORTED_VERSIONS_NOTE } from './supportedVersions';
import { BUTTON_BASE, BUTTON_CENTRED, BUTTON_SIZE, BUTTON_VARIANT } from './components/Button';

export interface HudModel {
  zoneName: string;
  position: [number, number, number];
  fps: number;
  entities: number;
  animated: number;
  terrainTiles: number;
  /** Tiles still streaming in, so a stutter can be told from a stall. */
  pendingTiles: number;
  drawCalls: number;
  /** Triangles drawn this frame, as the renderer counts them. */
  triangles: number;
  textures: number;
  /** CPU effect simulation time, ms. */
  effectsMs: number;
  /** NetworkBodies clip selection time, ms. */
  clipsMs: number;
  status: string;
}

/** The frame-rate readout; everything else is in `ubiquitous.inspect()`. */
export class Hud {
  private readonly fps: HTMLElement;
  private readonly draws: HTMLElement;
  private readonly counts: HTMLElement;
  private readonly place: HTMLElement;

  constructor(root: HTMLElement) {
    root.className = 'flex flex-col items-center gap-0.5 text-center text-shadow-world';
    const big = document.createElement('div');
    big.className = 'flex items-baseline gap-3 font-chrome text-xl font-bold text-parchment-100';
    this.fps = document.createElement('span');
    this.draws = document.createElement('span');
    big.append(this.fps, this.draws);

    this.counts = document.createElement('div');
    this.counts.className = 'font-mono text-tiny text-parchment-200';

    this.place = document.createElement('div');
    this.place.className = 'font-mono text-tiny text-ink-400';

    root.append(big, this.counts, this.place);
  }

  render(model: HudModel): void {
    this.fps.textContent = `${model.fps} fps`;
    this.draws.textContent = `${model.drawCalls} draws \u00b7 ${(model.triangles / 1000).toFixed(0)}k tris`;
    const pendingStr = model.pendingTiles ? ` (+${model.pendingTiles})` : '';
    this.counts.textContent =
      `${model.terrainTiles} tiles${pendingStr} \u00b7 ${model.entities} entities ` +
      `(${model.animated} animated) \u00b7 ${model.textures} textures ` +
      `\u00b7 fx ${model.effectsMs.toFixed(1)}ms clips ${model.clipsMs.toFixed(1)}ms`;
    const [x, y, z] = model.position;
    const posStr = model.position.length
      ? `pos ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`
      : '';
    this.place.textContent = [model.zoneName, posStr, model.status]
      .filter(Boolean)
      .join(' \u00b7 ');
  }
}

/**
 * Boot overlay: pick a game source, then start. Also doubles as the zone
 * loading screen: show() for a plain message, progress() when the app can
 * name how far along it is. Shown over whatever exists, so it talks to
 * callbacks rather than to any engine object.
 */
export class BootScreen {
  private readonly panel: HTMLElement;
  private readonly message: HTMLElement;
  private readonly list: HTMLElement;
  private readonly barOuter: HTMLElement;
  private readonly barFill: HTMLElement;
  /** Object URL behind the current splash, revoked when it is replaced. */
  private splashUrl: string | null = null;
  /** Splash ticket: art set asynchronously can finish out of order, so only the latest draws. */
  private splashSeq = 0;

  /** Claim the next splash slot. Pass the ticket back to the setters. */
  nextSplash(): number {
    return ++this.splashSeq;
  }

  constructor(root: HTMLElement) {
    this.panel = root;
    // `#boot` belongs to `index.html`, so the boot screen dresses it here
    // rather than from a stylesheet rule: this way the whole overlay is styled
    // in the same utilities as every component, and the splash art — a runtime
    // object URL — can go straight onto the element that shows it.
    this.panel.className = [
      'fixed inset-0 z-boot flex flex-col items-center justify-center gap-5 p-6',
      'bg-chrome-950 bg-cover bg-center bg-no-repeat',
      'text-center font-chrome text-sm/relaxed text-parchment-200',
    ].join(' ');
    this.message = document.createElement('div');
    this.message.className = 'max-w-prose whitespace-pre-wrap';
    this.list = document.createElement('div');
    this.list.className = 'flex flex-col gap-2';
    // Hidden until progress() is called with a fraction; inline styles own
    // this element's visibility because show()/hide() toggle it directly.
    this.barOuter = document.createElement('div');
    this.barOuter.className =
      'h-2 w-3/4 max-w-105 overflow-hidden rounded-chrome border border-brass-600 bg-chrome-900 shadow-recess';
    this.barOuter.style.display = 'none';
    this.barFill = document.createElement('div');
    this.barFill.className =
      'h-full bg-linear-to-b from-brass-300 to-brass-500 transition-width duration-150 ease-linear';
    this.barOuter.append(this.barFill);
    this.panel.append(this.message, this.barOuter, this.list);
  }

  /**
   * A boot-screen button, wearing the same face as the `Button` component's
   * secondary variant — literally the same strings. This screen runs before
   * Preact is mounted, so it cannot render the component itself.
   */
  private button(label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = `${BUTTON_BASE} ${BUTTON_CENTRED} ${BUTTON_VARIANT.secondary} ${BUTTON_SIZE.lg}`;
    return button;
  }

  /** Remove the splash art and revoke its URL. */
  clearSplash(ticket?: number): void {
    if (ticket !== undefined && ticket !== this.splashSeq) return;
    this.panel.style.removeProperty('background-image');
    if (this.splashUrl) URL.revokeObjectURL(this.splashUrl);
    this.splashUrl = null;
  }

  /** Art behind the boot text, with the scrim in the same declaration. */
  private paintSplash(url: string): void {
    this.panel.style.backgroundImage = [
      'linear-gradient(rgb(0 0 0 / 0.72), rgb(0 0 0 / 0.72))',
      `url("${url}")`,
    ].join(', ');
  }

  /**
   * Show art that is already an image, with no decoding of ours in the way.
   *
   * The URL is owned by the caller: these are held for the whole session, so
   * revoking one here would break the next teleport back.
   */
  setSplashUrl(url: string | null, ticket?: number): void {
    if (!url) return;
    if (ticket !== undefined && ticket !== this.splashSeq) return;
    if (this.splashUrl) URL.revokeObjectURL(this.splashUrl);
    this.splashUrl = null;
    this.paintSplash(url);
  }

  /** Set splash art from a decoded bitmap; the object URL it makes is revoked on replacement, or teleports leak. */
  setSplash(image: ImageBitmap | null, ticket?: number): void {
    if (!image) return;
    if (ticket !== undefined && ticket !== this.splashSeq) return;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      // Checked again: the encode is where the overtaking actually happens.
      if (ticket !== undefined && ticket !== this.splashSeq) return;
      const url = URL.createObjectURL(blob);
      if (this.splashUrl) URL.revokeObjectURL(this.splashUrl);
      this.splashUrl = url;
      this.paintSplash(url);
    });
  }

  show(text: string): void {
    this.panel.style.display = 'flex';
    this.message.textContent = text;
    this.barOuter.style.display = 'none';
    this.list.replaceChildren();
  }

  /**
   * Progress with real numbers. `fraction` 0..1, or null to show movement
   * without claiming a completion point (data still in flight). `accent`
   * optionally tints the bar — the app may pass the destination zone's fog
   * colour, since no per-zone loading art ships in the package.
   */
  progress(text: string, fraction: number | null, accent?: string): void {
    this.show(text);
    this.barOuter.style.display = 'block';
    if (accent) this.barFill.style.background = accent;
    if (fraction === null) {
      this.barFill.classList.add('animate-boot-slide');
      this.barFill.style.width = '30%';
    } else {
      this.barFill.classList.remove('animate-boot-slide');
      this.barFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
    }
  }

  /** Offer a choice of sources; resolves with the chosen source id. */
  choose(prompt: string, options: Array<{ id: string; label: string }>): Promise<string> {
    this.show(prompt);
    return new Promise(resolve => {
      for (const option of options) {
        const button = this.button(option.label);
        button.addEventListener('click', () => resolve(option.id), { once: true });
        this.list.append(button);
      }
    });
  }

  /** Ask for the user's game file; a browser cannot look for it, so the picker is part of booting. */
  pickFile(
    prompt: string,
    pick: () => Promise<File[]>,
    opts: { label?: string; skipLabel?: string; versions?: boolean } = {},
  ): Promise<File[]> {
    this.show(prompt);
    return new Promise(resolve => {
      const button = this.button(opts.label ?? 'Choose game file(s)...');
      // The picker must run inside the click: both showOpenFilePicker and the
      // permission prompt behind it require a user gesture. Resolving a
      // promise first and calling them after loses the activation.
      button.addEventListener('click', () => {
        void pick()
          .then(files => {
            if (files.length) resolve(files);
          })
          .catch(() => {
            // Cancelled. The button stays, so they can try again.
          });
      });
      this.list.append(button);

      // Offered when carrying on without the file is a real choice — with a
      // cached build it is, for as long as you stay in a zone it already has.
      if (opts.skipLabel) {
        const skip = this.button(opts.skipLabel);
        skip.addEventListener('click', () => resolve([]));
        this.list.append(skip);
      }

      if (opts.versions) this.list.append(this.versionsLink());
    });
  }

  /** The "Supported versions" link, opening a dialog over the boot screen. */
  private versionsLink(): HTMLElement {
    const link = document.createElement('button');
    link.type = 'button';
    link.textContent = 'Supported versions';
    link.dataset.bootVersions = 'link';
    link.className = 'self-center text-brass-300 underline hover:text-brass-400';
    link.addEventListener('click', () => this.openVersions());
    return link;
  }

  private openVersions(): void {
    const backdrop = document.createElement('div');
    backdrop.dataset.bootVersions = 'dialog';
    backdrop.className =
      'absolute inset-0 z-10 flex items-center justify-center bg-chrome-950/85 p-6';
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) backdrop.remove();
    });

    const card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Supported versions');
    card.className =
      'flex max-h-full max-w-prose flex-col gap-3 overflow-y-auto rounded-chrome border border-brass-600 bg-chrome-900 p-5 text-left shadow-recess';

    const title = document.createElement('div');
    title.className = 'font-bold text-parchment-100';
    title.textContent = 'Supported versions';
    card.append(title);

    for (const { version, note } of SUPPORTED_VERSIONS) {
      const row = document.createElement('div');
      row.className = 'whitespace-pre-line';
      const name = document.createElement('span');
      name.className = 'font-bold text-parchment-100';
      name.textContent = `${version} `;
      row.append(name, note);
      card.append(row);
    }

    const other = document.createElement('div');
    other.textContent = UNSUPPORTED_VERSIONS_NOTE;
    const close = this.button('Close');
    close.addEventListener('click', () => backdrop.remove());
    card.append(other, close);

    backdrop.append(card);
    this.panel.append(backdrop);
  }

  /**
   * Progress for a long step measured in bytes, e.g. extracting a 654 MB
   * pack. A thin wrapper over `progress` so there is one bar, not two.
   */
  progressBytes(text: string, done: number, total: number): void {
    const fraction = total > 0 ? Math.min(1, done / total) : null;
    this.progress(fraction === null ? text : `${text} ${Math.round(fraction * 100)}%`, fraction);
  }

  hide(): void {
    this.panel.style.display = 'none';
  }
}
