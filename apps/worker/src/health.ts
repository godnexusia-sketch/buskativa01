import { createServer, type Server } from "node:http";

export type HealthStatus = { queue: "connected" | "disconnected"; lastRunAt?: Date };

/**
 * Servidor de liveness para o Render (Web Service exige uma porta aberta).
 * Responde 200 em "/" e "/healthz" mesmo com o Redis reconectando: o processo está
 * vivo e a conexão se recupera sozinha; reiniciar por isso só perderia o navegador.
 * O estado da fila vai no corpo para consulta humana.
 */
export function createHealthServer(getStatus: () => HealthStatus | Promise<HealthStatus>): Server {
  return createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if ((req.method === "GET" || req.method === "HEAD") && (path === "/" || path === "/healthz")) {
      const { queue, lastRunAt } = await Promise.resolve().then(getStatus).catch((): HealthStatus => ({ queue: "disconnected" }));
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, queue, ...(lastRunAt ? { lastRunAt: lastRunAt.toISOString() } : {}) }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false }));
  });
}
