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
| `VOTE_SALT` | Sal do hash (sha256) do IP nos votos de cupom; sem ele a votação responde 503 |

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

## Deploy (Render + Supabase)

1. Crie um projeto no Supabase e copie a connection string (modo "session") para `DATABASE_URL`.
2. No Render, crie um Blueprint apontando para este repositório (usa `render.yaml`).
3. Preencha as variáveis marcadas como `sync: false`.
4. O worker roda as migrações ao iniciar e já dispara 20 buscas.

O limite de requisições (rate limit) da API identifica o cliente por `cf-connecting-ip`, `true-client-ip` ou `x-real-ip` quando existem; senão usa o último salto (o mais à direita) de `x-forwarded-for`, que é o adicionado pelo proxy mais próximo. Isso só é confiável se o app ficar atrás de um único proxy que acrescente esse cabeçalho e se o acesso direto ao app estiver bloqueado; com proxies extras (CDN na frente do Render, por exemplo) o último salto passa a ser o do proxy, e vários clientes podem dividir o mesmo limite. O limite fica em memória por instância, então não é compartilhado entre réplicas.

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
