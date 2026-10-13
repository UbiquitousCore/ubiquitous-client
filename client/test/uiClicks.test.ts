// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { clickOf } from '../src/app/uiClicks';

function page(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe('clickOf', () => {
  it('tells a tab from a button, from anywhere inside either', () => {
    const root = page(
      '<div role="tab"><span id="t">Bag</span></div>' +
        '<button id="b"><i id="bi">x</i></button>' +
        '<div data-tab="skills" id="d"></div>' +
        '<div role="button" id="r"></div>',
    );
    expect(clickOf(root.querySelector('#t'))).toBe('tab');
    expect(clickOf(root.querySelector('#d'))).toBe('tab');
    expect(clickOf(root.querySelector('#bi'))).toBe('button');
    expect(clickOf(root.querySelector('#r'))).toBe('button');
  });

  it('makes no click for the world, text, or a button that is switched off', () => {
    const root = page(
      '<canvas id="c"></canvas><input id="i"><p id="p">hi</p><button id="off" disabled></button>',
    );
    expect(clickOf(root.querySelector('#c'))).toBeNull();
    expect(clickOf(root.querySelector('#i'))).toBeNull();
    expect(clickOf(root.querySelector('#p'))).toBeNull();
    expect(clickOf(root.querySelector('#off'))).toBeNull();
    expect(clickOf(null)).toBeNull();
  });

  it('makes no click for the jump button: the jump itself may sound', () => {
    const root = page('<div data-jump><button id="j">Jump</button></div>');
    expect(clickOf(root.querySelector('#j'))).toBeNull();
  });
});
