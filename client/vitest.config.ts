import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The UI tests render real components, so the JSX transform has to run here
  // too. It is a no-op for the engine tests, which are plain TypeScript.
  plugins: [preact()],
  test: {
    // Engine tests are the overwhelming majority and need no DOM; the handful
    // of component tests opt in per file with an `@vitest-environment`
    // docblock, which is cheaper than giving every test a document.
    environment: 'node',
    // Node 25+ defines its own `localStorage`, which is empty without a file
    // and shadows the DOM environment's; turn it off so happy-dom's is used.
    execArgv: ['--no-experimental-webstorage'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
