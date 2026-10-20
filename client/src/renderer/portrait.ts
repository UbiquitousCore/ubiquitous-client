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
 * Stand the body in the pose its skins were fitted in, and return what puts
 * each bone back where the clip had it.
 *
 * Skinned bones go to their bind pose (`Skeleton.pose`), where a face and the
 * helmet over it meet as they were made to; the file's own node pose is not
 * always that, and a portrait taken in it showed the face through the helmet.
 * Bones no skin names fall back to the file's node pose.
 */
export function holdStill(object: THREE.Object3D): () => void {
  const kept: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3]> = [];
  const keep = (bone: THREE.Object3D): void => {
    kept.push([bone, bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()]);
  };
  // A skinned mesh is culled by bounds taken in whatever pose it was first
  // drawn in, which the still pose can leave behind.
  const culled: THREE.Object3D[] = [];
  const skeletons = new Set<THREE.Skeleton>();
  object.traverse(node => {
    const skin = node as THREE.SkinnedMesh;
    if (!skin.isSkinnedMesh) return;
    if (skin.frustumCulled) {
      culled.push(skin);
      skin.frustumCulled = false;
    }
    if (skin.skeleton) skeletons.add(skin.skeleton);
  });
  const posed = new Set<THREE.Object3D>();
  for (const skeleton of skeletons) {
    for (const bone of skeleton.bones) {
      if (posed.has(bone)) continue;
      posed.add(bone);
      keep(bone);
    }
    skeleton.pose();
  }
  object.traverse(node => {
    const rest = node.userData.rest as RestPose | undefined;
    if (!(node as THREE.Bone).isBone || !rest || posed.has(node)) return;
    keep(node);
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
