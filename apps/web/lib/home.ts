import { topDrops, type Drop } from "@buskativa/db";
import { getDb } from "./server";

/** Maiores quedas para a home; sem banco devolve [] (estado vazio) em vez de derrubar a página com 500. */
export async function loadTopDrops(now: Date, limit: number): Promise<Drop[]> {
  try {
    return await topDrops(getDb(), now, limit);
  } catch (err) {
    console.error("falha ao carregar as maiores quedas", err);
    return [];
  }
}
