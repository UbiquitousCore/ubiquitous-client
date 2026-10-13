/**
 * The frame through its own buffer (sky, world, then a copy to the screen),
 * only while tone mapping is on. The buffer holds the values the canvas
 * would, so the grading works on the finished picture.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

import type { ToneMapping } from '../../core/graphics';

const TONE: Record<ToneMapping, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

/**
 * Have three's programs write display values into this buffer, graded, as
 * they write to the canvas, so see-through effects add up as they do on
 * screen: added in linear light instead, a faint glow over a dark floor
 * shows far brighter. Three does this only for a target it takes for a
 * headset's display, which it reads by this flag and the texture's colour
 * space; nothing else here touches that path.
 */
function holdDisplayValues(target: THREE.WebGLRenderTarget): void {
  target.texture.colorSpace = THREE.SRGBColorSpace;
  (target as THREE.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
}

export interface PostSettings {
  toneMapping: ToneMapping;
}

/** Whether these settings need the buffer at all. */
export function needsPostEffects(settings: PostSettings): boolean {
  return settings.toneMapping !== 'none';
}

export class PostEffects {
  private readonly composer: EffectComposer;
  private toneMapping: ToneMapping = 'none';
  /** The size the chain was last built for; `setSize` runs every frame. */
  private sizedWidth = -1;
  private sizedHeight = -1;
  private sizedPixelRatio = -1;

  constructor(
    private readonly gl: THREE.WebGLRenderer,
    skyScene: THREE.Scene,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    multisample: boolean,
  ) {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: multisample ? 4 : 0,
    });
    this.composer = new EffectComposer(gl, target);
    holdDisplayValues(this.composer.renderTarget1);
    holdDisplayValues(this.composer.renderTarget2);
    // The sky first, clearing; then the world over it, clearing nothing: the
    // sky writes no depth, so the depth it leaves is the cleared value. See
    // `Renderer.skyScene`.
    const skyPass = new RenderPass(skyScene, camera);
    const worldPass = new RenderPass(scene, camera);
    worldPass.clear = false;
    // A sky that does write depth (the selection scene's dome) must not hide
    // the world; for one that writes none this clears nothing that matters.
    worldPass.clearDepth = true;
    this.composer.addPass(skyPass);
    this.composer.addPass(worldPass);
    // The buffer already holds the screen's values: the last pass copies.
    this.composer.addPass(new ShaderPass(CopyShader));
  }

  set(settings: PostSettings): void {
    this.toneMapping = settings.toneMapping;
  }

  /** Match the canvas's drawing buffer. Cheap when nothing changed. */
  setSize(width: number, height: number, pixelRatio: number): void {
    if (
      width === this.sizedWidth &&
      height === this.sizedHeight &&
      pixelRatio === this.sizedPixelRatio
    ) {
      return;
    }
    this.sizedWidth = width;
    this.sizedHeight = height;
    this.sizedPixelRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(): void {
    const gl = this.gl;
    gl.toneMapping = TONE[this.toneMapping];
    try {
      this.composer.render();
    } finally {
      // The canvas path, the hero stages and the portraits all expect this.
      gl.toneMapping = THREE.NoToneMapping;
    }
  }

  dispose(): void {
    this.composer.dispose();
  }
}
