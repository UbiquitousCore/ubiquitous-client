import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseServer, withServer } from './serverLine.mjs';

test('the server line is replaced and nothing else is touched', () => {
  const text = '# note\ndebug=false\nserver=/ubiquitous-server\n';
  assert.equal(withServer(text, 'ws://10.0.0.5:8781'), '# note\ndebug=false\nserver=ws://10.0.0.5:8781\n');
});

test('a file with no server line gains one', () => {
  assert.equal(withServer('debug=false', 'ws://h:1'), 'debug=false\nserver=ws://h:1\n');
});

test('no chosen server leaves the file as it is', () => {
  assert.equal(withServer('server=ws://a:1\n', null), 'server=ws://a:1\n');
});

test('the command line wins over the environment, which wins over the saved file', () => {
  const env = { UBIQUITOUS_SERVER: 'ws://env:1' };
  assert.equal(chooseServer({ argv: ['--server=ws://flag:1'], env, saved: 'ws://file:1' }), 'ws://flag:1');
  assert.equal(chooseServer({ argv: [], env, saved: 'ws://file:1' }), 'ws://env:1');
  assert.equal(chooseServer({ argv: [], env: {}, saved: ' ws://file:1\n' }), 'ws://file:1');
});

test('anything that is not a websocket address is ignored', () => {
  assert.equal(chooseServer({ argv: ['--server=http://x'], env: {}, saved: undefined }), null);
  assert.equal(chooseServer({ argv: [], env: {}, saved: undefined }), null);
});
