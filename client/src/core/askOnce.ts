/**
 * Ask once and keep the answer, but forget a failure (null): an early ask
 * before the packs are mounted must not settle it for the session.
 */
export function askOnce<T>(read: () => Promise<T>): () => Promise<T | null> {
  let asked: Promise<T | null> | null = null;
  return () => {
    // Everyone who asks while one ask is in flight waits on that one; a
    // second read is started only once the first has come back empty.
    asked ??= read()
      .catch(() => null)
      .then(answer => {
        if (answer === null) asked = null;
        return answer;
      });
    return asked;
  };
}
