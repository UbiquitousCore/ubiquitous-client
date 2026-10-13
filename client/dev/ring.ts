/**
 * The target ring in every relation colour, drawn by the class the game
 * uses, over a flat ground with a stand-in body on each ring. `?far=1` backs
 * the camera off, to see that the outline keeps its pixel width.
 */

import * as THREE from 'three';

import '../src/ui/styles/global.css';
import { POP_MS, RELATIONS, TargetRing, placeRing } from '../src/renderer/TargetRing';
import type { RingWorld } from '../src/renderer/TargetRing';

const canvas = document.getElementById('rings') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6d7f4a);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404030, 2.5));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x5a6b3c }),
);
scene.add(ground);

const flat: RingWorld = {
  groundPoint: () => ({ y: 0, normal: [0, 1, 0] }),
  waterStateAt: () => ({ state: 'dry' }),
};

const relations = RELATIONS;
const body = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 16).translate(0, 0.9, 0);
const skin = new THREE.MeshLambertMaterial({ color: 0x9a8a78 });
relations.forEach((relation, i) => {
  const x = (i - (relations.length - 1) / 2) * 2.4;
  const ring = new TargetRing();
  ring.set(
    placeRing(flat, { position: [x, 0, 0], scale: [1, 1, 1] }, [0.6, 0.6], relation, POP_MS),
  );
  scene.add(ring.object);
  const unit = new THREE.Mesh(body, skin);
  unit.position.set(x, 0, 0);
  scene.add(unit);
});

const far = new URLSearchParams(location.search).has('far');
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(0, far ? 14 : 6, far ? 24 : 9);
camera.lookAt(0, 0, 0);

function draw(): void {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  document.body.dataset.ready = '1';
}
window.addEventListener('resize', draw);
draw();
