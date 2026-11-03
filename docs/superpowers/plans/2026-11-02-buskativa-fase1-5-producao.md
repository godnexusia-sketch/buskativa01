# BUSKATIVA Fase 1.5 — Descontos, cupons, Google e produção

> Executado com subagentes (um por pacote de trabalho, revisão depois de cada um). O usuário deu autonomia total: decisões abaixo já estão tomadas.

**Objetivo:** site público funcionando na internet onde a pessoa pesquisa um produto e vê o menor preço, se está com desconto (inclusive desconto no app/Pix), os cupons disponíveis da loja, e todos os produtos rastreados; pronto para ligar Google Analytics, Search Console e AdSense e ganhar dinheiro com anúncios + links de afiliado.

**Base:** branch `fase1-nucleo` (Fase 1 completa, 114+ testes). Mesmas regras globais da Fase 1 (`docs/superpowers/plans/2026-11-01-buskativa-fase1.md`, seção Global Constraints), mais as abaixo.

## Regras globais novas

- Nunca inventar cupons, preços, avaliações ou dados de loja. Cupom só entra por cadastro do administrador (API protegida) ou por coleta de fonte real (fases futuras). Banco começa sem cupons.
- Integrações Google são todas opcionais por variável de ambiente; sem a variável, nada é carregado e a página funciona igual:
  - `NEXT_PUBLIC_GA_ID` (GA4, ex. `G-XXXX`), `NEXT_PUBLIC_ADSENSE_CLIENT` (ex. `ca-pub-123`), `NEXT_PUBLIC_ADSENSE_SLOT_*` (slots), `GOOGLE_SITE_VERIFICATION` (Search Console), `NEXT_PUBLIC_SITE_URL` (URL canônica, ex. `https://buskativa.onrender.com`).
- LGPD: banner de consentimento de cookies; Google Consent Mode v2 com tudo `denied` por padrão até o usuário aceitar; escolha salva em `localStorage` (com try/catch).
- Textos da interface em pt-BR. Tudo funciona no celular (largura 360 px).
- Admin: `ADMIN_TOKEN` (Bearer) protege as rotas `/api/admin/*`; sem a variável, as rotas respondem 503.

## Pacote A — Desconto e preço original

- `Offer` ganha `originalPrice?: number` (preço "de", antes do desconto) e `attributes.pagamento` opcional com `"app"` ou `"pix"` quando o card diz que o preço é no app/Pix.
- Fontes do preço original:
  - Mercado Livre: campo `original_price` da API (quando > price).
  - Amazon (`parseAmazon`): `.a-text-price .a-offscreen` (preço riscado) quando > price.
  - `parseAnchors`: maior valor BRL dentre os candidatos não excluídos (não parcela/frete/cashback) quando > preço escolhido.
  - JSON-LD: `offers.highPrice` quando > price.
  - PA-API: `Offers.Listings[0].SavingBasis.Amount`.
- Detecção de pagamento: texto do card com `/(no|pelo) app|exclusivo (no|do) app/i` → `"app"`; `/no pix|à vista no pix/i` → `"pix"`.
- Banco: coluna `original_price_cents` (nullable) em `price_observations` e `query_results`; nova migração via `npm run db:generate -w @buskativa/db`. `saveOffers` grava; `getRunWithResults` retorna `originalPriceCents` e `pagamento` (de `products.attributes`).
- Core: `discountPercent(price, originalPrice?) : number | null` (arredondado, só se original > price e desconto entre 1% e 95%).
- Web: nos resultados e no produto, selo `-X%`, texto "de R$ X por R$ Y", selo "Preço no app"/"Preço no Pix" e selo "Abaixo da média de 30 dias" (produto, quando `changeVsAvg30d <= -0.05`).
- Testes: unitários para cada fonte, `discountPercent`, repo grava/lê o original, renderização não precisa de teste de componente.

## Pacote B — Cupons com validação

- Tabela `coupons`: `id`, `store` (StoreId), `code` (texto, maiúsculas, 3–40 chars `[A-Z0-9_-]`), `title`, `description` (nullable), `discountType` (`percent` | `fixed` | `frete`), `discountValue` (número; percent 1–90, fixed em centavos > 0, frete 0), `minOrderCents` (nullable), `validUntil` (timestamptz nullable), `sourceUrl` (nullable, precisa ser https), `source` (`oficial` | `telegram` | `manual`), `active` (bool, default true), `worked` (int 0), `failed` (int 0), `createdAt`. Único `(store, code)`.
- Tabela `coupon_votes`: `couponId`, `voterHash` (sha256 de IP + salt `VOTE_SALT`), `worked` bool, `at`; único `(couponId, voterHash)` (um voto por pessoa, pode trocar).
- Core `validateCoupon(input, now)`: regras acima, rejeita vencido, loja fora da allowlist, código inválido. `couponConfidence({worked, failed, validUntil, source}, now)`: `alta` | `media` | `baixa` | `expirado` — oficial começa média; com ≥3 votos usa taxa de sucesso (≥0.7 alta, ≥0.4 média, senão baixa).
- Repo: `upsertCoupon`, `listActiveCoupons(store?, now)` (não expirados, ordenados por confiança e data), `voteCoupon(couponId, voterHash, worked)` (atualiza contadores de forma consistente), `deactivateCoupon`.
- API: `GET /api/cupons?loja=` (público), `POST /api/cupons/:id/voto` `{funcionou: boolean}` (rate limit 10/min por IP), `POST /api/admin/cupons` (cria/atualiza, valida, 400 com mensagens pt-BR), `DELETE /api/admin/cupons/:id` (desativa).
- Web: página `/cupons` (todas as lojas, filtro por loja, botão copiar código, botões "Funcionou"/"Não funcionou", selo de confiança, validade); na busca, chip "N cupons" por loja com link; no produto, lista de cupons da loja.
- Testes: validação, confiança, repo (votos únicos, troca de voto), rotas admin (token).

## Pacote C — Todos os produtos e filtros

- Página `/ofertas`: lista paginada (24 por página, `?pagina=`) de todos os produtos rastreados com último preço, desconto e loja; filtros por loja, faixa de preço (`?min=&max=` em reais) e ordem (`menor-preco` padrão, `maior-desconto`, `recentes`). Repo `listProducts({store?, minCents?, maxCents?, order, limit, offset})` com o último preço por produto (uma query; use `DISTINCT ON` ou subquery lateral; índice existente serve).
- Busca (`/busca`): filtros no cliente por loja e faixa de preço e ordenação por menor preço/maior desconto; mostrar todas as ofertas (grupos expansíveis continuam) e contador "N ofertas em M lojas".
- Navegação no cabeçalho: Início, Ofertas, Cupons.

## Pacote D — Google, SEO e páginas institucionais

- `app/layout.tsx`: metadata com `metadataBase` = `NEXT_PUBLIC_SITE_URL`, título padrão/template, descrição, OpenGraph, `verification.google` = `GOOGLE_SITE_VERIFICATION`.
- Componente `Analytics` (client): Consent Mode v2 defaults `denied`, carrega gtag do GA4 com `next/script` só se `NEXT_PUBLIC_GA_ID`; ao aceitar no banner chama `gtag('consent','update', granted)`.
- Componente `CookieBanner` (client): aceitar / recusar, link para `/privacidade`.
- AdSense: script carregado só se `NEXT_PUBLIC_ADSENSE_CLIENT`; componente `AdSlot({slot})` que não renderiza nada sem client/slot; colocar um slot na home, nos resultados (após o 6º card) e no produto. Rota `app/ads.txt/route.ts` que devolve `google.com, pub-XXXX, DIRECT, f08c47fec0942fa0` a partir do client (sem client → 404).
- `app/sitemap.ts` (home, ofertas, cupons, institucionais + até 5000 produtos) e `app/robots.ts` (permite tudo, bloqueia `/api/`, `/ir/`, aponta sitemap).
- Produto: JSON-LD `Product` com `offers` (`price`, `priceCurrency` BRL, `url` = `/ir/:id`), `generateMetadata` com título/descrição do produto.
- Páginas: `/privacidade` (LGPD: dados coletados — IP para limite de uso e voto em cupom com hash, cookies do Google se aceitos, cliques em links de afiliado; direitos do titular; contato), `/termos`, `/sobre` (explica que o site usa links de afiliado e pode receber comissão), `/contato` (e-mail via `NEXT_PUBLIC_CONTACT_EMAIL`, padrão `godnexus.ia@gmail.com`). Rodapé com links e aviso de afiliado.

## Pacote E — Produção (worker em Render, health check)

- Worker: servidor HTTP mínimo em `PORT` (se definido) respondendo `200 ok` em `/` e `/healthz` com status (fila conectada), para rodar como Web Service no Render. `WORKER_CONCURRENCY` padrão 1 em produção (Chromium em 512 MB).
- `render.yaml` atualizado: web e worker como `type: web` com `plan: starter`, `healthCheckPath`, env de Google/ADMIN_TOKEN/VOTE_SALT/NEXT_PUBLIC_SITE_URL.
- `NEXT_PUBLIC_*` são lidas no build do Next: o Dockerfile.web aceita `ARG`s correspondentes e repassa como `ENV` antes do `npm run build`.
- README: seção "Ligar o Google" (GA4, Search Console, AdSense, ads.txt) passo a passo e "Cadastrar cupons" (curl de exemplo).

## Pacote F — Deploy (controlador)

GitHub (repo privado), Supabase (projeto novo), Render (Key Value + 2 Web Services Docker), variáveis, migração (feita pelo worker ao iniciar), verificação no navegador da URL pública: busca, ofertas, cupons, produto, ads.txt/sitemap/robots.
