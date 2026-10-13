/** A body's still portrait (observed in play by the owner), framed by `framePortrait` and lit as the stage. */
import * as THREE from 'three';

import { framePortrait, headOf, shippedCamera } from './portraitFraming';
import { lightAsStage } from './stageLight';

/** The portrait as a data URL; `pullBack` moves the camera further (`framePortrait`). The object is put back as found. */
export function renderPortrait(
  gl: THREE.WebGLRenderer,
  object: THREE.Object3D,
  size = 128,
  pullBack = 1,
): string | null {
  const unpose = holdStill(object);
  try {
    return photograph(gl, object, size, pullBack);
  } finally {
    unpose();
    object.updateWorldMatrix(true, true);
  }
}

/** A bone's pose as its file stands it, kept on the bone when it is built. */
interface RestPose {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

/**
 * Stand every bone in `object` as its file stands it, and return what puts
 * each back where the clip had it.
 */
export function holdStill(object: THREE.Object3D): () => void {
  const kept: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3]> = [];
  // A skinned mesh is culled by bounds taken in whatever pose it was first
  // drawn in, which the still pose can leave behind.
  const culled: THREE.Object3D[] = [];
  object.traverse(node => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh && node.frustumCulled) {
      culled.push(node);
      node.frustumCulled = false;
    }
    const rest = node.userData.rest as RestPose | undefined;
    if (!(node as THREE.Bone).isBone || !rest) return;
    kept.push([node, node.position.clone(), node.quaternion.clone(), node.scale.clone()]);
    node.position.fromArray(rest.position);
    node.quaternion.fromArray(rest.quaternion);
    node.scale.fromArray(rest.scale);
  });
  return () => {
    for (const mesh of culled) mesh.frustumCulled = true;
    for (const [bone, position, quaternion, scale] of kept) {
      bone.position.copy(position);
      bone.quaternion.copy(quaternion);
      bone.scale.copy(scale);
    }
  };
}

function photograph(
  gl: THREE.WebGLRenderer,
  object: THREE.Object3D,
  size: number,
  pullBack: number,
): string | null {
  const parent = object.parent;
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return null;
  const shot = framePortrait(
    bounds,
    object.getWorldQuaternion(new THREE.Quaternion()),
    shippedCamera(object),
    headOf(object),
    pullBack,
  );

  const camera = new THREE.PerspectiveCamera(shot.fov, 1, shot.near, shot.far);
  camera.position.copy(shot.position);
  camera.up.copy(shot.up);
  camera.lookAt(shot.target);
  camera.updateMatrixWorld();

  const scene = new THREE.Scene();
  lightAsStage(scene);
  scene.add(object);

  const was = gl.getRenderTarget();
  // sRGB, because the renderer writes sRGB and a plain target does not
  // convert on the way in: read back as linear, the picture comes out a
  // step too dark.
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const pixels = new Uint8Array(size * size * 4);
  try {
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.readRenderTargetPixels(target, 0, 0, size, size, pixels);
  } finally {
    gl.setRenderTarget(was);
    if (parent) parent.add(object);
    else object.removeFromParent();
    target.dispose();
  }
  return asUrl(pixels, size);
}

/** Rows come off the card bottom-up, so they go into the canvas flipped. */
function asUrl(pixels: Uint8Array, size: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const row = (size - 1 - y) * size * 4;
    image.data.set(pixels.subarray(row, row + size * 4), y * size * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
