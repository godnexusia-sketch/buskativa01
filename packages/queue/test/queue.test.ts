import { normalizeQuery } from "@buskativa/core";
import type { Queue } from "bullmq";
import { describe, expect, it } from "vitest";
import { enqueueSearch, type SearchJob, searchJobOptions } from "../src/index";

describe("searchJobOptions", () => {
  it("busca do usuário: jobId do run e sem prioridade (roda antes das agendadas)", () => {
    expect(searchJobOptions({ text: "fone", runId: 42 })).toEqual({ jobId: "run-42" });
  });

  it("busca agendada: deduplica pela consulta enquanto espera/roda e tem prioridade baixa", () => {
    const hash = normalizeQuery("Fone Bluetooth").hash;
    const opts = searchJobOptions({ text: "Fone Bluetooth" });
    expect(opts).toEqual({ deduplication: { id: `q-${hash}` }, priority: 10 });
    // o mesmo id em qualquer momento: não existe mais janela de 10 min
    expect(searchJobOptions({ text: "fone   bluetooth" })).toEqual(opts);
  });
});

describe("enqueueSearch", () => {
  it("adiciona o job com as opções calculadas", async () => {
    const calls: unknown[][] = [];
    const queue = { add: async (...args: unknown[]) => void calls.push(args) } as unknown as Queue<SearchJob>;
    await enqueueSearch(queue, { text: "fone", runId: 7 });
    expect(calls).toEqual([["search", { text: "fone", runId: 7 }, { jobId: "run-7" }]]);
  });
});
