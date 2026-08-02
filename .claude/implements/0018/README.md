# [0018] Rotas do app cliente: leitura do mapa e marcação de quadra

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 19

## Solicitação

> Spec 0001 — Task 19: Crie `server/app/routers/app_client.py` com `GET /app/territories` (todos os
> territórios da congregação do token, cada um com suas quadras, incluindo `number`, `polygon` e
> `last_worked_at`) e `POST /app/blocks/{id}/worked` (corpo `{log_id, worked_at}`, respondendo **201**
> quando cria e **200** quando o `log_id` já existia), e registre-o em `app/main.py`. Ambas usam a
> dependência de token de app. Escreva testes de rota cobrindo: leitura devolve só os territórios da
> congregação do token; marcação cria o log e reflete `last_worked_at` na leitura seguinte; reenvio do
> mesmo `log_id` responde 200 sem duplicar; marcar quadra de outra congregação responde 404; token de
> **admin** nessas rotas responde 401; e — o mais importante — **nenhuma rota de escrita de `/admin/*`
> aceita um token de app**, verificado com uma tentativa de `POST /admin/territories` usando token de
> app, que deve responder 401. Toque apenas em `app/routers/app_client.py`, o registro em
> `app/main.py` e os testes correspondentes.

## Contexto

Toda a camada de serviço já existia (`TerritoryService`, `BlockService`, `WorkLogService`), assim como
as dependências de autenticação (`current_app_user`) e o handler único de `DomainError`. Faltava a
superfície HTTP que o app Flutter consome — que é deliberadamente mínima: o app **lê o mapa** e
**anexa ao log de trabalho**, e mais nada.

Essa minimalidade é uma decisão de segurança, não de escopo. O token do app não expira, então cada
endpoint que ele alcança é uma porta que fica aberta para sempre num aparelho perdido. O `CLAUDE.md`
registra isso como "dois tipos de token, com poderes bem diferentes", e a Task 19 pede a prova
executável de que a separação é real.

## O que foi feito

`app/routers/app_client.py`, com prefixo `/app` e as duas rotas atrás de `current_app_user`:

- **`GET /app/territories`** — devolve `list[TerritoryOut]`: todos os territórios da congregação do
  token, cada um com `boundary` e com `blocks` (`number`, `polygon`, `last_worked_at`). Resposta
  completa, sem paginação, porque o app faz cache dela para trabalhar sem sinal em campo.
- **`POST /app/blocks/{block_id}/worked`** — corpo `WorkedIn` (`log_id`, `worked_at` timezone-aware),
  chama `WorkLogService.mark_worked` e traduz a flag `created` que o service devolve: **201** quando
  gravou agora, **200** quando o `log_id` já estava lá.

Registro em `app/main.py` (`include_router(app_client.router)`).

Testes em `tests/routers/test_app_client_routes.py` (12 casos), incluindo a varredura de rotas
descrita abaixo.

## Arquivos modificados

- `server/app/main.py` — import e `include_router` do novo router (duas linhas)

## Arquivos criados

- `server/app/routers/app_client.py` — as duas rotas do app e a montagem dos três services
- `server/tests/routers/test_app_client_routes.py` — testes de rota

## Decisões técnicas

**Status dinâmico por `Response`, não por dois endpoints.** A rota é declarada com
`status_code=201` e rebaixa para 200 escrevendo em `response.status_code` quando o service diz que o
log já existia. A alternativa — o router consultar o repositório antes para saber se é reenvio —
colocaria a decisão de idempotência em duas camadas; do jeito que ficou, o service é o dono da regra
e o router só traduz a resposta dele em código HTTP.

**Geometria lida pelos services (`boundary_points` / `polygon_points`), nunca da coluna.** O WKT e a
ordem `(lng, lat)` param uma camada abaixo. É a regra do `CLAUDE.md` sobre inversão de coordenadas
sendo respeitada por construção: neste módulo só existem pares `lat`/`lng` nomeados.

**A congregação vem de `user.congregation_id`.** Nenhuma das duas rotas aceita `congregation_id` em
path, query ou corpo — não há como um cliente nomear dados de outra congregação.

**`blocks.list(congregation_id, territory.id)` por território, em vez de `territory.blocks`.** Usar a
relação ORM direto no router seria consultar dados fora da camada de repositório. O custo é uma
verificação de posse extra por território (o `_require_territory` do `BlockService`); com dezenas de
territórios por congregação, o `CLAUDE.md` é explícito de que otimizar isso cedo não vale o custo.

**Os *service providers* (`get_territory_service`, `get_block_service`) são locais deste módulo.** Há
funções equivalentes em `admin_territories.py`/`admin_blocks.py` (Task 18, executada em paralelo). A
duplicação foi aceita porque o escopo da task proíbe tocar outros routers e porque criar um módulo
compartilhado durante duas tasks concorrentes editando `main.py` era o caminho mais provável para um
conflito. Se um terceiro router precisar dos mesmos providers, é hora de extraí-los.

**A varredura de rotas de escrita do admin é lida do schema OpenAPI da aplicação.** O teste
`test_no_admin_write_route_accepts_an_app_token` não tem lista escrita à mão: ele pergunta a
`app.openapi()["paths"]` quais são as rotas `POST`/`PUT`/`PATCH`/`DELETE` sob `/admin/*` e tenta todas
com um token de app, exigindo 401 em cada uma. Duas razões: uma lista manual envelheceria no primeiro
router novo — exatamente o caso em que a garantia importa —, e `app.routes` mudou de forma no
Starlette 1.3 (rotas incluídas viram `_IncludedRouter` sem `.path`), enquanto o OpenAPI descreve a
tabela de roteamento de forma estável. O teste também afirma que a lista não está vazia, para que uma
varredura sobre nada nunca passe por engano. Hoje ela cobre **10 rotas**. O caso nomeado pela task
(`POST /admin/territories`) tem, além disso, seu próprio teste explícito.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d          # PostGIS
cd server && uv run pytest tests/routers/test_app_client_routes.py -v
```

Manualmente, com o servidor de pé: ative um publicador (`POST /app/activate`), use o token
retornado em `GET /app/territories`, marque uma quadra com `POST /app/blocks/{id}/worked` (deve vir
201), reenvie o mesmo corpo (deve vir 200) e releia os territórios — `last_worked_at` da quadra deve
refletir o `worked_at` enviado. Com o mesmo token de app, `POST /admin/territories` deve responder
401.

## Resultado da validação

- `uv run pytest tests/routers/test_app_client_routes.py` — **12 passaram**, nenhum pulado
- `uv run pytest` (suíte inteira) — **372 passaram**
- `uv run ruff check` e `ruff format --check` nos arquivos desta task — limpos

Observação para quem vier depois: no momento em que esta task rodou, a Task 18 (executada em
paralelo) tinha acabado de registrar `admin_territories` e `admin_blocks`, e `ruff check .` apontava
dois `E501` em `tests/routers/test_admin_territories_routes.py`, arquivo daquela task. Não foram
tocados aqui por estarem fora do escopo.
