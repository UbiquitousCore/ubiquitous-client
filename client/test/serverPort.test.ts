import { describe, expect, it } from 'vitest';
import { configWithServerPort, serverPortFrom, withPort } from '../serverPort';

describe('serverPort', () => {
  it('reads a valid port and ignores anything else', () => {
    expect(serverPortFrom({ UBIQUITOUS_SERVER_PORT: '9000' })).toBe(9000);
    for (const bad of [undefined, '', 'abc', '0', '70000', '80.5'])
      expect(serverPortFrom({ UBIQUITOUS_SERVER_PORT: bad })).toBeNull();
  });

  it('swaps the port and keeps the rest of the address', () => {
    expect(withPort('ws://127.0.0.1:8781', 9000)).toBe('ws://127.0.0.1:9000');
    expect(withPort('wss://play.example/socket', 9000)).toBe('wss://play.example:9000/socket');
    expect(withPort('ws://127.0.0.1:8781', null)).toBe('ws://127.0.0.1:8781');
  });

  it('rewrites only the server line of config.txt', () => {
    const text = '# server=ws://old:1\ndebug=false\nserver=ws://127.0.0.1:8781\n';
    expect(configWithServerPort(text, 9000)).toBe(
      '# server=ws://old:1\ndebug=false\nserver=ws://127.0.0.1:9000\n',
    );
    expect(configWithServerPort(text, null)).toBe(text);
  });
});
