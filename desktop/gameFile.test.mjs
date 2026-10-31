import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHOOSE_BUTTON, chooseGameFile } from './gameFile.mjs';

const none = () => {
  throw new Error('no such folder');
};

test('the command line wins over the environment, which wins over a bundled file', () => {
  const list = () => ['bundled.ipa'];
  const env = { UBIQUITOUS_IPA: '/env/game.ipa' };
  assert.equal(
    chooseGameFile({ argv: ['--ipa=/flag/game.ipa'], env, folders: ['/g'], list }),
    '/flag/game.ipa',
  );
  assert.equal(chooseGameFile({ argv: [], env, folders: ['/g'], list }), '/env/game.ipa');
  assert.equal(chooseGameFile({ argv: [], env: {}, folders: ['/g'], list }), '/g/bundled.ipa');
});

test('a bundled folder is searched in order, and an unreadable one is skipped', () => {
  const list = folder => (folder === '/second' ? ['x.txt', 'B.IPA', 'a.ipa'] : none());
  assert.equal(
    chooseGameFile({ argv: [], env: {}, folders: ['/first', '/second'], list }),
    '/second/B.IPA',
  );
});

test('nothing named and nothing bundled leaves the choice to the player', () => {
  assert.equal(chooseGameFile({ argv: [], env: {}, folders: ['/g'], list: () => ['notes.txt'] }), null);
  assert.equal(chooseGameFile({ argv: [], env: {}, folders: ['/g'], list: none }), null);
});

test('only the boot screen buttons for choosing the game file match', () => {
  assert.ok(CHOOSE_BUTTON.test('Choose game file(s)...'));
  assert.ok(CHOOSE_BUTTON.test('Choose game file...'));
  assert.ok(!CHOOSE_BUTTON.test('Choose a different file...'));
  assert.ok(!CHOOSE_BUTTON.test('Carry on without sound'));
});
