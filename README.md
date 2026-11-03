# BUSKATIVA

Busca 24h o menor preço de um produto em lojas reais (Mercado Livre, Amazon, Magalu, Shopee, AliExpress, TikTok Shop), guarda o histórico e mostra o melhor dia/horário para comprar.

## Rodar localmente

```bash
cp .env.example .env          # CONNECTORS=demo usa lojas falsas
docker compose up -d          # Postgres + Redis
npm install
npx playwright install chromium
npm run start -w @buskativa/worker   # em um terminal
npm run dev -w @buskativa/web        # em outro: http://localhost:3000
```

Para as lojas reais, deixe `CONNECTORS` vazio no `.env`.

## Testes

```bash
npm test                         # unitários (Vitest)
npm run e2e -w @buskativa/web    # E2E (precisa do docker compose)
npm run smoke -w @buskativa/connectors -- amazon fone bluetooth   # checagem ao vivo de uma loja
```

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres (Supabase em produção) |
| `REDIS_URL` | Redis da fila |
| `CONNECTORS` | `demo` para lojas falsas; vazio para as reais |
| `ML_ACCESS_TOKEN` | Token do Mercado Livre, se a API de busca exigir |
| `AMAZON_PAAPI_*` | Credenciais do PA-API; sem elas a Amazon usa o navegador |
| `KWAI_ENABLED` | `true` liga o conector experimental do Kwai Shop |
| `SEARCH_INTERVAL_MIN` / `SEARCH_FAST_INTERVAL_MIN` | Intervalo das buscas recorrentes (60 / 30) |
| `AFFILIATE_PARAMS_<LOJA>` | Parâmetros de afiliado, ex.: `tag=seutag-20` |
| `ADMIN_TOKEN` | Token Bearer das rotas `/api/admin/*`; sem ele respondem 503 |
| `TRUSTED_IP_HEADER` | Opcional: cabeçalho de IP confiável definido pela sua CDN (ex.: `cf-connecting-ip`) |
| `VOTE_SALT` | Sal do hash (sha256) do IP nos votos de cupom; sem ele a votação responde 503 |
| `WORKER_CONCURRENCY` | Buscas simultâneas no worker (3 por padrão; o `render.yaml` usa 1 por causa do Chromium em 512 MB) |
| `PORT` | Worker: se definida, abre o health check HTTP (`/` e `/healthz`); o Render a injeta |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTROLLER_NAME` | URL canônica, e-mail de contato e nome do controlador (LGPD) |
| `GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_HOME` / `_RESULTS` / `_PRODUCT` | Integrações Google, veja "Ligar o Google" |

As variáveis `NEXT_PUBLIC_*` são embutidas no site durante o build: depois de mudar uma, faça um novo deploy do `buskativa-web`.

## Cadastrar cupons

O banco começa **sem nenhum cupom**: eles só entram pela API de administração (ou, no futuro, por coleta de fonte real). Defina `ADMIN_TOKEN` e envie com `Authorization: Bearer`:

```bash
curl -X POST https://SEU-SITE/api/admin/cupons \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "store": "amazon",
    "code": "CODIGO10",
    "title": "10% de desconto em eletrônicos",
    "discountType": "percent",
    "discountValue": 10,
    "minOrderCents": 10000,
    "validUntil": "2026-12-31T23:59:00-03:00",
    "sourceUrl": "https://www.amazon.com.br/promocao-exemplo",
    "source": "manual"
  }'
```

- `discountType`: `percent` (1 a 90), `fixed` (centavos, maior que 0) ou `frete` (valor 0). `source`: `oficial`, `telegram` ou `manual`.
- Enviar a mesma loja + código de novo atualiza o cupom (os votos são mantidos). Erros de validação voltam com status 400 e mensagens em português.
- Para desativar: `curl -X DELETE https://SEU-SITE/api/admin/cupons/ID -H "Authorization: Bearer $ADMIN_TOKEN"`.
- Os visitantes votam "Funcionou" / "Não funcionou" em `/cupons` (um voto por pessoa, 10 por minuto por IP). Com 3 votos ou mais, a confiança vem da taxa de sucesso.
- O voto não usa cookie: guardamos só sha256(IP + `VOTE_SALT`), nunca o IP em claro. Há um voto por cupom por IP (trocável), então pessoas atrás do mesmo IP compartilham o voto.

## Deploy no Render

1. **Supabase:** crie um projeto e, em *Connect*, copie a connection string do **Session pooler** (porta 5432, host `...pooler.supabase.com`; o endereço direto só tem IPv6 e o Render não alcança). Troque `[YOUR-PASSWORD]` pela senha do banco. Ela será o `DATABASE_URL`.
2. **Blueprint:** no Render, *New > Blueprint*, escolha este repositório (o Render lê o `render.yaml`). Serão criados `buskativa-web`, `buskativa-worker` (ambos Web Service Docker, plano `starter`, região `oregon`, a mais próxima do Brasil) e o Key Value `buskativa-redis` (plano gratuito). `REDIS_URL`, `ADMIN_TOKEN` e `VOTE_SALT` são preenchidos sozinhos.
3. **Variáveis:** o Render pede as marcadas `sync: false`. Cole o mesmo `DATABASE_URL` nos dois serviços. Preencha `NEXT_PUBLIC_SITE_URL` com a URL pública do web (ex.: `https://buskativa-web.onrender.com`; se o Render acrescentar um sufixo ao nome, use a URL real e atualize depois). Tudo o que for opcional (Google, afiliados, `ML_ACCESS_TOKEN`, PA-API) pode ficar vazio e ser preenchido depois.
4. **Primeira subida:** o worker roda as migrações ao iniciar e já enfileira 20 buscas. O web só deve receber tráfego depois disso (deixe o worker subir primeiro, ou faça um *Manual Deploy* do web em seguida).
5. **Health checks:** o web usa `/`; o worker usa `/healthz`, que responde 200 com `{"ok":true,"queue":"connected"}`. É teste de vida: continua 200 enquanto o Redis reconecta (campo `queue` vira `disconnected`), porque reiniciar o container por isso só derrubaria o Chromium.
6. **Admin:** o valor gerado de `ADMIN_TOKEN` fica em *Environment* do `buskativa-web`; use-o para cadastrar cupons (seção acima).

O Chromium do worker precisa de memória: com `WORKER_CONCURRENCY=1` o plano `starter` (512 MB) comporta uma busca por vez. Para aumentar a concorrência, suba o plano antes.

## Ligar o Google

Todas as integrações são opcionais e só carregam se a variável existir. Depois de mudar qualquer `NEXT_PUBLIC_*`, faça novo deploy do `buskativa-web` (elas são lidas no build). O banner de cookies e o Consent Mode v2 já estão ativos: tudo nasce negado até o visitante aceitar.

**1. Google Analytics 4**
1. Em [analytics.google.com](https://analytics.google.com), crie uma propriedade GA4 e um fluxo de dados da Web com a URL do site.
2. Copie o *ID da métrica* (formato `G-XXXXXXXXXX`).
3. No Render, `buskativa-web` > *Environment*: `NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX`, e faça redeploy.
4. Aceite o banner no site e confira em *Relatórios > Tempo real*.

**2. Search Console**
1. Em [search.google.com/search-console](https://search.google.com/search-console), adicione uma propriedade do tipo **Prefixo do URL** com `NEXT_PUBLIC_SITE_URL`.
2. Escolha o método **Tag HTML** e copie só o valor de `content="..."` da tag `google-site-verification`.
3. Defina `GOOGLE_SITE_VERIFICATION=<valor>` no Render, faça redeploy e clique em *Verificar*.
4. Em *Sitemaps*, envie `SEU-SITE/sitemap.xml` (home, ofertas, cupons, páginas institucionais e os produtos). O `robots.txt` já aponta para ele.

**3. AdSense**
1. A aprovação exige um site com conteúdo e páginas institucionais; elas já existem: `/privacidade`, `/termos`, `/sobre` e `/contato`. Publique o site e deixe-o rodando com produtos antes de pedir.
2. Em [adsense.google.com](https://adsense.google.com), cadastre o site (a URL de `NEXT_PUBLIC_SITE_URL`).
3. Defina `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX` (ID do editor) e faça redeploy. O script do AdSense passa a carregar e **`/ads.txt` é gerado automaticamente** com `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`; sem a variável, `/ads.txt` responde 404.
4. Depois da aprovação, crie três blocos de anúncio (*Anúncios > Por bloco de anúncios*) e copie o ID numérico de cada um para `NEXT_PUBLIC_ADSENSE_SLOT_HOME`, `NEXT_PUBLIC_ADSENSE_SLOT_RESULTS` e `NEXT_PUBLIC_ADSENSE_SLOT_PRODUCT`. Sem o slot, o espaço do anúncio não aparece.
5. Os anúncios só são personalizados para quem aceitou o banner de cookies.

O limite de requisições (rate limit) identifica o cliente pelo salto mais à direita de `x-forwarded-for` (o adicionado pelo proxy do Render); cabeçalhos como `cf-connecting-ip` ou `x-real-ip` são ignorados porque o cliente pode forjá-los. Se houver uma CDN sua na frente (e o app só for acessível por ela), defina `TRUSTED_IP_HEADER` (ex.: `cf-connecting-ip`) para confiar nesse único cabeçalho. O limite fica em memória por instância, então não é compartilhado entre réplicas.

## Estado das lojas

Resultado do smoke test ao vivo (consulta "fone bluetooth", 2026-11-02):

| Loja | Resultado |
|---|---|
| Amazon | ok (60 ofertas, via navegador) |
| AliExpress | ok (9 ofertas, via navegador) |
| Mercado Livre | bloqueado (HTTP 403) — precisa de `ML_ACCESS_TOKEN` |
| Magalu | bloqueado (página anti-robô) |
| Shopee | bloqueado (verificação de tráfego) — usar API de afiliados no futuro |
| TikTok Shop | bloqueado (página vazia) |
| Kwai Shop | desligado por padrão (`KWAI_ENABLED=true` liga; sem busca web confirmada) |

Lojas bloqueadas aparecem como "indisponível agora" e as outras continuam funcionando; o app nunca tenta resolver CAPTCHA.
