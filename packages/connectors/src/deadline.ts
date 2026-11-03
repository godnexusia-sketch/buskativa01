import { ConnectorError } from "@buskativa/core";

/** Rejects with TIMEOUT after `ms` and aborts the signal so the fetch can stop its own work. */
export async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new ConnectorError("TIMEOUT", `sem resposta em ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([work(ac.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
