# BUSKATIVA — Design (Fase 1: núcleo de busca e histórico de preços)

Data: 2026-11-01
Status: aprovado em conversa, aguardando revisão da spec escrita

## 1. Visão geral

BUSKATIVA é um app web público que pesquisa 24h por dia o menor preço de produtos em lojas reais e bem avaliadas, mostra o histórico de preços (menor preço, dia e horário) e estima quando o preço tende a cair. O clique em uma oferta leva direto à loja, via link de afiliado.

### Decisões já tomadas
| Tema | Decisão |
|---|---|
| Fonte de dados | Híbrida: APIs oficiais onde existem + navegador automatizado (Playwright) nas demais |
| Hospedagem | Nuvem, rodando 24h |
| Usuários | Público, com contas (a partir da Fase 2) |
| Monetização | Links de afiliado |
| Cupons | Validação combinada: regras + fontes oficiais/Telegram + votos dos usuários (Fase 3/4) |
| Stack | TypeScript de ponta a ponta |

### Roadmap
1. **Fase 1 (este documento):** busca multi-loja, menor preço, histórico e gráfico, melhor dia/horário, agendador 24h com 20 buscas iniciais, redirecionamento com afiliado.
2. **Fase 2:** contas (Supabase Auth), produtos salvos, alertas de queda de preço (e-mail/Telegram), limites de uso por conta.
3. **Fase 3:** bot do Telegram, conexão com grupos de oferta, publicação automática de ofertas, coleta de cupons.
4. **Fase 4:** validação de cupons com nota de confiança, previsão de preço refinada.

Cada fase terá sua própria spec e plano.

## 2. Arquitetura

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  web (Next)  │────▶│  Postgres        │◀────│  worker      │
│  UI + API    │     │  (Supabase)      │     │  (Node)      │
└──────┬───────┘     └──────────────────┘     └──────┬───────┘
       │  enfileira buscas      ┌─────────┐          │ consome
       └───────────────────────▶│  Redis  │◀─────────┘
                                │ (BullMQ)│
                                └─────────┘
```

Monorepo (pnpm workspaces):
- `apps/web` — Next.js (App Router): páginas, rotas de API, rota de redirecionamento `/ir/:id`.
- `apps/worker` — processo Node que consome a fila, roda os conectores e o agendador.
- `packages/core` — tipos compartilhados, normalização de consulta, cálculo de estatísticas de preço.
- `packages/connectors` — um conector por loja.
- `packages/db` — schema e acesso ao banco (Drizzle ORM + migrações).

Deploy: Docker; `web` e `worker` como serviços separados (ex.: Render/Railway), Postgres no Supabase, Redis gerenciado (ex.: Upstash/Render Key Value).

## 3. Componentes

### 3.1 Normalizador de consulta (`packages/core/query`)
Entrada: texto livre. Saída: `{ termo, tipo: "generica" | "especifica", atributos: { marca?, modelo?, capacidade?, cor?, tamanho?, voltagem? } }`.
- Extração por regras (regex + dicionário de marcas, unidades como GB/TB/ml/kg, tamanhos P/M/G/GG/38–44, cores).
- **Específica** quando tem marca + modelo, ou dois ou mais atributos. Senão, **genérica**.
- Genérica: agrupa resultados semelhantes por similaridade de título. Específica: aplica os filtros em cada loja (parâmetros da API ou campos da página) e descarta resultados cujo título não bate com os atributos.

### 3.2 Conectores (`packages/connectors`)
Interface única:
```ts
interface Connector {
  id: StoreId;                       // "mercadolivre" | "amazon" | ...
  search(q: NormalizedQuery, opts: { limit: number }): Promise<Offer[]>;
}
interface Offer {
  store: StoreId; externalId: string; title: string; url: string;
  price: number; shipping: number | null; currency: "BRL";
  sellerName?: string; sellerRating?: number; imageUrl?: string;
  attributes: Record<string, string>;
}
```
Lojas da Fase 1:
| Loja | Método |
|---|---|
| Mercado Livre | API pública de busca |
| Amazon BR | PA-API 5 se houver credenciais, senão Playwright |
| Shopee | Playwright (API de afiliados quando disponível) |
| Magalu | Playwright |
| AliExpress | Playwright (API de afiliados quando disponível) |
| TikTok Shop, Kwai Shop | Playwright, marcados como "experimentais" (podem falhar) |

Regras:
- **Lojas permitidas** fixas (allowlist). Domínios fora da lista são ignorados.
- **Qualidade do vendedor:** quando a loja informa, descarta nota abaixo de 4,0 (configurável) e vendedores sem histórico.
- Playwright com limite de concorrência por loja, intervalo mínimo entre requisições e timeout de 30s. Não resolve CAPTCHA: se aparecer, o conector falha com `BLOCKED`.

### 3.3 Fila e agendador (`apps/worker`)
- Fila `search` (BullMQ). Cada job tem uma consulta e roda os conectores em paralelo com `Promise.allSettled`.
- **Ao iniciar o worker:** enfileira 20 buscas imediatamente: consultas vigiadas mais recentes e, para completar, uma lista inicial de produtos populares (`seed/trending.json`).
- **Recorrência:** cada consulta vigiada é repetida a cada 60 min (configurável). Consultas com variação recente de preço passam a cada 30 min.
- Repetição com backoff em erros de rede (3 tentativas). `BLOCKED` não repete até o próximo ciclo.

### 3.4 Histórico e estatísticas (`packages/core/stats`)
Para cada produto (loja + externalId), a partir das observações de preço:
- menor preço já visto, com data e horário;
- preço atual e variação em relação à média de 30 dias;
- **melhor dia da semana** e **melhor faixa de horário** (blocos de 3h): mediana do preço por grupo, escolhendo a menor;
- **tendência/estimativa:** "próxima janela provável de preço baixo" = próxima ocorrência do melhor dia + faixa, com nível de confiança (baixa < 14 dias de dados ou < 30 observações; média < 60 dias; alta acima disso). O texto deixa claro que é uma estimativa.

### 3.5 Web (`apps/web`)
Páginas:
- `/` — busca e ofertas em destaque (maiores quedas das últimas 24h).
- `/busca?q=` — resultados ordenados por preço total (preço + frete quando conhecido), filtros por loja/faixa de preço, selo da loja e do vendedor. Mostra quais lojas falharam ("Loja X indisponível agora").
- `/produto/:id` — gráfico do histórico (Recharts), menor preço com dia/hora, melhor dia, melhor horário, estimativa da próxima queda, ofertas do mesmo produto em outras lojas.

Rotas de API: `POST /api/buscas` (enfileira e devolve id), `GET /api/buscas/:id` (status + resultados; a página consulta até concluir), `GET /api/produtos/:id/historico`.

Busca nova: se já houver resultado com menos de 15 min para a mesma consulta normalizada, devolve do cache. Senão, enfileira e mostra os resultados parciais conforme cada loja termina.

### 3.6 Redirecionamento com afiliado
`GET /ir/:offerId` registra o clique (`clicks`) e responde 302 para a URL da loja com a tag de afiliado aplicada por loja (`AFFILIATE_AMAZON_TAG`, `AFFILIATE_ML_ID`, etc., via variáveis de ambiente). Sem tag configurada, redireciona para a URL limpa. Só redireciona para domínios da allowlist.

## 4. Modelo de dados (Postgres)
- `stores` (id, nome, domínio, método, ativo)
- `queries` (id, texto_original, normalizada jsonb, hash, vigiada bool, ultima_execucao, criada_em)
- `products` (id, store_id, external_id, título, url, imagem, atributos jsonb, vendedor, nota_vendedor) — único (store_id, external_id)
- `price_observations` (id, product_id, preço, frete, observado_em) — índice (product_id, observado_em)
- `query_results` (query_id, product_id, execucao_id, posição)
- `search_runs` (id, query_id, início, fim, status por loja jsonb)
- `clicks` (id, product_id, em, referer)

## 5. Erros e limites
- Falha de uma loja nunca derruba a busca: o status por loja é salvo em `search_runs` e mostrado na UI.
- Preços suspeitos (zero, ou abaixo de 10% da mediana do grupo) são descartados como provável erro de leitura.
- Rate limit na API pública: 30 buscas/min por IP na Fase 1.
- Logs estruturados (pino) no worker, com contagem de sucesso/falha por loja.

## 6. Testes
- **Normalizador:** casos de tabela (genérica vs específica, extração de atributos).
- **Conectores:** testes com fixtures (HTML/JSON salvos) verificando a extração de `Offer`. Um teste de fumaça "ao vivo" opcional, fora do CI.
- **Estatísticas:** séries sintéticas com padrão conhecido (ex.: mais barato às terças 0h–3h) verificando melhor dia/horário e níveis de confiança.
- **Redirecionamento:** tag aplicada corretamente por loja, bloqueio de domínio fora da allowlist.
- Vitest no monorepo; Playwright Test para um fluxo E2E da busca com conectores falsos.

## 7. Fora do escopo da Fase 1
Contas e login, alertas, Telegram, cupons, app mobile nativo, previsão por modelo de ML.

## 8. Riscos conhecidos
- Lojas sem API podem bloquear o scraping ou mudar o layout; os conectores Playwright vão precisar de manutenção.
- Scraping pode contrariar os termos de uso de algumas lojas; dar preferência às APIs de afiliados assim que houver credenciais.
- A estimativa de queda de preço só fica útil depois de algumas semanas de histórico.
