# [0019] Rotas de território, quadra e histórico de trabalho (admin)

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 18

## Solicitação

> Spec 0001 — Task 18: Crie `server/app/routers/admin_territories.py` (`POST`/`GET`/`GET {id}`/`PATCH`/`DELETE`
> em `/admin/territories`) e `server/app/routers/admin_blocks.py` (`POST /admin/territories/{id}/blocks`,
> `PATCH /admin/blocks/{id}`, `DELETE /admin/blocks/{id}`, `GET /admin/blocks/{id}/work-logs`,
> `DELETE /admin/work-logs/{id}`), conforme o contrato da spec 0001, e registre-os em `app/main.py`.
> Todas as rotas exigem a dependência de admin e derivam a congregação do token; recurso de outra
> congregação responde **404**. `GET /admin/territories/{id}` devolve o território com suas quadras.
> O tratamento de erro reaproveita o handler de `DomainError` criado na Task 17 — não crie outro.
> Escreva testes de rota cobrindo: criação bem-sucedida, 422 em polígono inválido, 422 em sobreposição
> de território, 409 em número de quadra duplicado, 404 em recurso de outra congregação e 401 sem token.
> Toque apenas em `app/routers/admin_territories.py`, `app/routers/admin_blocks.py`, o registro em
> `app/main.py` e os testes correspondentes.

## Contexto

Os services de território (implements/0014), quadra (implements/0016) e registro de trabalho
(implements/0015) já existiam com todas as regras geométricas testadas contra PostGIS real, e a
Task 17 (implements/0017) já tinha montado o handler único de `DomainError` em `app/main.py`.
Faltava a superfície HTTP: o app admin não tinha como desenhar território, numerar quadra nem
corrigir o histórico.

Esta task é a camada de tradução — DTO ↔ domínio, exceção de domínio ↔ status code — e nada mais.

## O que foi feito

Dois routers novos, ambos inteiramente atrás de `current_congregation`, sem nenhum
`congregation_id` em path ou corpo.

`admin_territories.py` — `/admin/territories`:

| Método | Rota | Resposta |
|--------|------|----------|
| POST | `/admin/territories` | 201 `TerritoryOut` |
| GET | `/admin/territories` | 200 `list[TerritoryOut]` (sem quadras) |
| GET | `/admin/territories/{id}` | 200 `TerritoryOut` **com as quadras** |
| PATCH | `/admin/territories/{id}` | 200 `TerritoryOut` |
| DELETE | `/admin/territories/{id}` | 204 sem corpo |

`admin_blocks.py` — quadras e histórico:

| Método | Rota | Resposta |
|--------|------|----------|
| POST | `/admin/territories/{id}/blocks` | 201 `BlockOut` |
| PATCH | `/admin/blocks/{id}` | 200 `BlockOut` |
| DELETE | `/admin/blocks/{id}` | 204 sem corpo |
| GET | `/admin/blocks/{id}/work-logs` | 200 `list[WorkLogOut]` |
| DELETE | `/admin/work-logs/{id}` | 204 sem corpo |

Os dois routers foram registrados em `app/main.py`. Nenhum handler de erro novo: `NotFoundError`,
`InvalidPolygonError`, `TerritoryOverlapError`, `BlockOutsideTerritoryError`, `BlockOverlapError` e
`DuplicateBlockNumberError` já caem no handler da Task 17 e saem como 404 / 422 / 409 com
`{"code", "detail"}`.

43 testes de rota novos, contra o app real e o PostGIS real.

## Arquivos modificados

- `server/app/main.py` — importa e registra `admin_territories.router` e `admin_blocks.router`

## Arquivos criados

- `server/app/routers/admin_territories.py` — CRUD de território; também é o *composition root* dos
  dois services geográficos (`get_territory_service`, `get_block_service`) e dos helpers de DTO
  (`to_points`, `to_ring_out`, `block_out`, `territory_out`)
- `server/app/routers/admin_blocks.py` — CRUD de quadra, leitura do histórico e remoção de log
- `server/tests/routers/test_admin_territories_routes.py` — 20 testes
- `server/tests/routers/test_admin_blocks_routes.py` — 23 testes

## Decisões técnicas

**As fábricas de service e os helpers de DTO ficam em `admin_territories.py`, e `admin_blocks.py`
importa deles.** `GET /admin/territories/{id}` precisa montar `BlockOut`, e as rotas de quadra
precisam do mesmo `BlockService` — sem um lado importando do outro, ou o helper era duplicado ou
havia importação circular. A direção escolhida (`admin_blocks → admin_territories`) espelha o que a
Task 17 já fez (`admin_users` importa `get_user_service` de `auth`) e segue a hierarquia do domínio:
a quadra vive dentro do território. O `utc_now` é reaproveitado de `app/routers/auth.py`, mantendo um
único ponto do sistema onde o relógio é lido.

**`admin_blocks.py` não declara `prefix`.** Criar quadra pendura em `/admin/territories/{id}/blocks`
e o resto endereça a quadra direto (`/admin/blocks/{id}`), então não existe prefixo comum. Preferiu-se
um router com caminhos completos a dois routers no mesmo arquivo: o ciclo de vida da quadra se lê de
cima a baixo em um lugar só.

**`DELETE` devolve `Response(status_code=204)` explicitamente** em vez de retornar `None`. Um 204
com `JSONResponse` produz o corpo `null`, que contraria "no content"; devolver a resposta vazia à mão
é o que garante `response.content == b""` — e o teste afirma isso.

**A geometria só é convertida em dois lugares do router**: `to_points` na entrada e `to_ring_out` na
saída, ambos apenas repassando o par `(lat, lng)`. A inversão para `lng lat` continua exclusiva de
`app/core/geo.py`, e o WKT nunca sobe acima da camada de service (`boundary_points`/`polygon_points`).

**`territory_out` só carrega as quadras onde elas foram pedidas.** A listagem devolve `blocks: []` de
propósito: o admin abrindo o mapa quer as áreas, e decodificar o contorno de toda quadra de todo
território tornaria a tela mais barata na mais cara. O contrato da spec pede as quadras só no detalhe.

**Os testes desenham quadrados com os cantos arredondados em 9 casas** (`round(lat + size, 9)`),
mesmo padrão já adotado nos testes de service: `0.1 + 0.2` não é `0.3` em float binário, e o PostGIS
devolve a coordenada na precisão dele — arredondar mantém a asserção sobre a geometria, não sobre o
último bit do float.

**O log de trabalho é inserido direto pela sessão nos testes**, com uma fixture `record_work`, porque
`POST /app/blocks/{id}/worked` é da Task 19: passar por lá amarraria estes testes a uma rota que tem
suíte própria.

## Como validar

Com o banco de desenvolvimento no ar (`docker compose -f docker-compose.dev.yml up -d`):

```bash
cd server
uv run pytest tests/routers/test_admin_territories_routes.py tests/routers/test_admin_blocks_routes.py
uv run pytest                      # suíte inteira
uv run ruff check . && uv run ruff format --check .
```

Manualmente, com o servidor rodando (`uv run uvicorn app.main:app --reload`), logando em
`POST /auth/login` e usando o `access_token` como `Authorization: Bearer`:

1. `POST /admin/territories` com `{"name": "Centro", "boundary": [4 pontos]}` → 201
2. Repetir com uma área que invada a primeira → 422 `territory_overlap`
3. `POST /admin/territories/{id}/blocks` com `{"polygon": [...]}` → 201 com `number: 1`
4. Repetir com `{"number": 1, ...}` → 409 `duplicate_block_number`
5. `GET /admin/territories/{id}` → o território com a quadra dentro
6. Qualquer rota sem o header `Authorization` → 401

## Resultado da validação

- `uv run pytest` — **394 testes passando** (339 antes desta task, 43 novos aqui e os demais vindos da
  Task 19, executada em paralelo), 36 s
- Os 43 testes novos cobrem os seis casos exigidos pela task: criação bem-sucedida (território e
  quadra), 422 em polígono auto-intersectante, 422 em sobreposição de território, 409 em número de
  quadra duplicado, 404 em recurso de outra congregação (território, quadra e log, parametrizado por
  método) e 401 sem token (parametrizado sobre as 10 rotas). Além deles: divisa encostada é aceita,
  a mesma área em outra congregação não conflita, redesenho não conflita consigo mesmo, encolher o
  contorno por cima de uma quadra devolve 422 citando o número dela, numeração automática preenche o
  primeiro buraco, e apagar um log devolve `last_worked_at` para `None`.
- `uv run ruff check .` e `ruff format` — limpos
- Revisão de camadas: os routers não contêm regra de negócio nem query; montam o service, convertem
  DTO ↔ domínio e devolvem. Nenhum `HTTPException` foi escrito — todo erro sobe como `DomainError` e
  é traduzido pelo handler único da Task 17.
