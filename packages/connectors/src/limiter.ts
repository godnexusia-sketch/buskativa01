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
    // setTimeout pode disparar alguns ms antes do relógio (Windows); repete até o instante alvo.
    for (let wait = startAt - Date.now(); wait > 0; wait = startAt - Date.now()) {
      await new Promise((r) => setTimeout(r, wait));
    }
    // o intervalo conta a partir do início real, não do agendado (o loop de eventos pode atrasar)
    nextStart = Math.max(nextStart, Date.now() + minIntervalMs);
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
