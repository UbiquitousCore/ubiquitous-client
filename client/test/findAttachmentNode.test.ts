import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { findAttachmentNode } from '../src/renderer/attachPoints';

function body(...names: string[]): THREE.Group {
  const root = new THREE.Group();
  for (const name of names) {
    const node = new THREE.Object3D();
    node.name = name;
    root.add(node);
  }
  return root;
}

describe('findAttachmentNode', () => {
  it('finds a node whatever its case and -node suffix', () => {
    expect(findAttachmentNode(body('dummy_r_waist-node'), 'Dummy_R_Waist')?.name).toBe(
      'dummy_r_waist-node',
    );
  });

  it('takes a numbered node when the plain name is missing', () => {
    expect(findAttachmentNode(body('Dummy_R_Waist01'), 'Dummy_R_Waist')?.name).toBe(
      'Dummy_R_Waist01',
    );
  });

  it('prefers the plain name over a numbered one', () => {
    expect(
      findAttachmentNode(body('Dummy_R_Waist01', 'Dummy_R_Waist'), 'Dummy_R_Waist')?.name,
    ).toBe('Dummy_R_Waist');
  });

  it('answers nothing when neither is there', () => {
    expect(findAttachmentNode(body('Dummy_L_Waist'), 'Dummy_R_Waist')).toBeNull();
  });
});
