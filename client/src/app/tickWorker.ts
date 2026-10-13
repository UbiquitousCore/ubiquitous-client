/**
 * A timer for a hidden tab. Sent a number of milliseconds, it posts back an
 * empty message that often; sent zero, it stops. A worker's timer is not
 * slowed while the page is hidden, which is the whole reason this exists.
 */

/// <reference lib="webworker" />

const scope = self as unknown as DedicatedWorkerGlobalScope;
let timer: ReturnType<typeof setInterval> | undefined;

scope.addEventListener('message', (event: MessageEvent<number>) => {
  clearInterval(timer);
  timer = undefined;
  if (event.data > 0) timer = setInterval(() => scope.postMessage(0), event.data);
});
