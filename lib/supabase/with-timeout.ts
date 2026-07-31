// Wraps a promise so a hung request (a Supabase query that never resolves,
// a flaky connection, etc.) fails after a fixed timeout instead of hanging
// the page forever. Next.js server components have no built-in request
// timeout, so without this a single stuck query shows the user an
// indefinitely spinning tab rather than any kind of error.
// Accepts PromiseLike (not just Promise) so Supabase's query builders —
// which are thenables but not strict Promise instances — can be passed in
// directly without an extra Promise.resolve() wrapper at every call site.
export function withTimeout<T>(promise: PromiseLike<T>, ms = 10000, label = "request"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
