export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLimiter(concurrency: number, minIntervalMs: number): Limiter {
  let active = 0;
  let nextStart = 0;
  const waiting: (() => void)[] = [];

  async function acquire() {
    if (active < concurrency) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve)); // a vaga é repassada por release()
    const startAt = Math.max(Date.now(), nextStart);
    nextStart = startAt + minIntervalMs;
    const wait = startAt - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  function release() {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }

  return async (fn) => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
