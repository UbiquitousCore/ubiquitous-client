/** Awaiting the server's answers on the screens before the world. */

/** Hands the resolver to whoever will call it when the answer arrives. */
export type Assign = (resolve: () => void) => void;

/**
 * Wait for an answer, rejecting when the server refuses or the socket goes.
 * @param assign receives the resolver.
 * @param onFailure receives the rejecter.
 */
export function waitOrFail(
  assign: Assign,
  onFailure: (fail: (why: string) => void) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    assign(resolve);
    onFailure(why => reject(new Error(why)));
  });
}

/**
 * Wait, but give up after `patienceMs`: for answers the server sends of its
 * own accord, so a lost one does not strand a screen.
 * @param onGiveUp called when the wait runs out.
 */
export function waitOrGiveUp(
  assign: Assign,
  patienceMs: number,
  onGiveUp?: () => void,
): Promise<void> {
  return new Promise<void>(resolve => {
    const timer = setTimeout(() => {
      onGiveUp?.();
      resolve();
    }, patienceMs);
    assign(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
