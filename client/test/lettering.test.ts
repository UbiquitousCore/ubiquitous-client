/**
 * The typefaces every word is drawn in, and handing the build's to the browser.
 *
 * The browser's font machinery is stood in for: a `FontFace` that records
 * what it was asked to register and can be told to refuse, and a document
 * whose font set records what was added.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const faceBytes = (n: number): Uint8Array => new Uint8Array([n, n, n, n]);

interface StandIn {
  family: string;
  descriptors?: FontFaceDescriptors;
}

let refuse: Set<string>;
let added: StandIn[];

beforeEach(() => {
  vi.resetModules();
  refuse = new Set();
  added = [];
  class StandInFace implements StandIn {
    constructor(
      readonly family: string,
      _source: ArrayBuffer,
      readonly descriptors?: FontFaceDescriptors,
    ) {}
    load(): Promise<this> {
      return refuse.has(this.family) ? Promise.reject(new Error('refused')) : Promise.resolve(this);
    }
  }
  vi.stubGlobal('FontFace', StandInFace);
  vi.stubGlobal('document', { fonts: { add: (face: StandIn) => added.push(face) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the stacks text is drawn in', () => {
  it('asks for the build’s faces first, then the fallback', async () => {
    const lettering = await import('../src/core/lettering');
    expect(lettering.BODY_STACK.startsWith(`'${lettering.BODY_FAMILY}', `)).toBe(true);
    expect(
      lettering.TITLE_STACK.startsWith(`'${lettering.TITLE_FAMILY}', '${lettering.BODY_FAMILY}', `),
    ).toBe(true);
    expect(lettering.BODY_STACK.endsWith(lettering.FALLBACK_STACK)).toBe(true);
    expect(lettering.TITLE_STACK.endsWith(lettering.FALLBACK_STACK)).toBe(true);
  });

  it('draws canvas text in the body face, at the size asked, never bold', async () => {
    const { BODY_STACK, canvasFont } = await import('../src/core/lettering');
    expect(canvasFont(32)).toBe(`32px ${BODY_STACK}`);
    expect(canvasFont(32)).not.toMatch(/bold|[5-9]00/);
  });
});

describe('handing the browser the build’s typefaces', () => {
  it('registers each under its fixed name, loaded, then tells whoever drew text', async () => {
    const lettering = await import('../src/core/lettering');
    const heard: string[] = [];
    lettering.onFacesChanged(() => {
      // By the time anyone hears, both are already in the document.
      heard.push(added.map(face => face.family).join(','));
    });
    const took = await lettering.registerFaces({
      body: { family: 'Body Face', bytes: faceBytes(1) },
      title: { family: 'Title Face', bytes: faceBytes(2) },
    });
    expect(took).toBe(true);
    expect(added.map(face => face.family)).toEqual([lettering.BODY_FAMILY, lettering.TITLE_FAMILY]);
    // One weight, so nothing asks the browser to invent another.
    expect(added[0].descriptors).toMatchObject({ weight: '400', style: 'normal' });
    expect(heard).toEqual([`${lettering.BODY_FAMILY},${lettering.TITLE_FAMILY}`]);
    expect(lettering.registeredFaces()).toEqual({ body: 'Body Face', title: 'Title Face' });
  });

  it('leaves a face the browser refuses in the fallback, and keeps the other', async () => {
    const lettering = await import('../src/core/lettering');
    refuse.add(lettering.TITLE_FAMILY);
    const took = await lettering.registerFaces({
      body: { family: 'Body Face', bytes: faceBytes(1) },
      title: { family: 'Title Face', bytes: faceBytes(2) },
    });
    expect(took).toBe(true);
    expect(added.map(face => face.family)).toEqual([lettering.BODY_FAMILY]);
    expect(lettering.registeredFaces()).toEqual({ body: 'Body Face', title: null });
  });

  it('tells nobody when nothing was registered', async () => {
    const lettering = await import('../src/core/lettering');
    const listener = vi.fn();
    lettering.onFacesChanged(listener);
    refuse.add(lettering.BODY_FAMILY);
    expect(
      await lettering.registerFaces({
        body: { family: 'Body Face', bytes: faceBytes(1) },
        title: null,
      }),
    ).toBe(false);
    expect(await lettering.registerFaces({ body: null, title: null })).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops telling a listener that unsubscribed', async () => {
    const lettering = await import('../src/core/lettering');
    const listener = vi.fn();
    const stop = lettering.onFacesChanged(listener);
    stop();
    await lettering.registerFaces({
      body: { family: 'Body Face', bytes: faceBytes(1) },
      title: null,
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('does nothing where the browser has no font machinery', async () => {
    vi.stubGlobal('FontFace', undefined);
    const lettering = await import('../src/core/lettering');
    expect(
      await lettering.registerFaces({
        body: { family: 'Body Face', bytes: faceBytes(1) },
        title: null,
      }),
    ).toBe(false);
  });
});
