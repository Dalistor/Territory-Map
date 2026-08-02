# [0001] Servidor FastAPI + PostGIS completo, em Docker, com CI/CD

**Data:** 2026-08-02
**Status:** Concluída
**Solicitação original:** "Vamos começar pelo servidor e banco de dados, tudo no docker para fácil deploy e CI via git actions"

## Objetivo

Ao término, existe um backend completo e publicado:

- API FastAPI com **todas** as entidades, regras de negócio e endpoints do `CLAUDE.md`
  (`Congregation`, `User`, `Territory`, `Block`, `BlockWorkLog`).
- PostgreSQL + PostGIS com schema versionado por Alembic.
- `docker compose` de desenvolvimento e de produção.
- GitHub Actions rodando lint + testes contra PostGIS real, construindo a imagem e fazendo
  deploy por SSH na VPS.

Nenhum código de cliente (Flutter) entra nesta spec.

## Contexto técnico

Projeto novo: só existem `CLAUDE.md` e `.claude/`. Tudo abaixo é criado do zero em `server/`.

### Decisões já tomadas (não reabrir durante a execução)

| Assunto | Decisão |
|---------|---------|
| Python | 3.12, gerenciado com **uv** (`pyproject.toml`, `uv.lock`) |
| ORM | SQLAlchemy 2.x **síncrono** + **psycopg 3**. Nada de async. |
| Geometria | `GEOMETRY(POLYGON, 4326)`, **não** `GEOGRAPHY` — `ST_Within`/`ST_Touches` só existem para `geometry`. Cast `::geography` só para área/distância em metros. Índice GIST em toda coluna geométrica. |
| Território | Sempre contíguo: `POLYGON`, nunca `MULTIPOLYGON` |
| Senha | bcrypt via `passlib` |
| Token | JWT via `python-jose`. Admin expira em 12h; token de app não expira e carrega `token_version`. |
| Rate limit | `slowapi` |
| Agendamento | `APScheduler` (`BackgroundScheduler`) iniciado no `lifespan` do FastAPI |
| Estilo | `ruff` (lint + format), `mypy` não obrigatório |

### Camadas (do `CLAUDE.md`, obrigatórias)

`routers → services → repositories → models`. Nunca o inverso.
DTOs (`schemas/`) só nas bordas. Service **não** conhece HTTP: lança exceção de domínio, e o router
traduz para status code. Repositório **não** contém regra de negócio.

### Estrutura alvo de `server/`

```
server/
├── pyproject.toml
├── Dockerfile
├── alembic.ini
├── .env.example
├── app/
│   ├── main.py
│   ├── core/       config.py  db.py  security.py  geo.py  exceptions.py  deps.py  scheduler.py
│   ├── models/     base.py  congregation.py  user.py  territory.py  block.py  block_work_log.py
│   ├── schemas/    auth.py  user.py  territory.py  block.py  work_log.py  geo.py
│   ├── repositories/  congregation.py  user.py  territory.py  block.py  block_work_log.py
│   ├── services/   auth.py  user.py  territory.py  block.py  work_log.py
│   ├── routers/    auth.py  admin_users.py  admin_territories.py  admin_blocks.py  app_client.py
│   └── jobs/       expire_codes.py
├── migrations/
└── tests/          (espelha app/)
```

### Contrato da API (referência para todas as tasks de router)

**Público**
- `POST /auth/login` — `{name, city, password}` → `{access_token, token_type, congregation:{id,name,city}}`
- `POST /app/activate` — `{access_code}` → `{token, user:{id,name}, congregation:{id,name,city}}`
- `GET /health` — `{status:"ok"}`

**Admin — `Authorization: Bearer <jwt admin>`**
- `POST /admin/users` `{name}` → `{id, name, access_code, access_code_expires_at}`
- `GET /admin/users` → lista `{id, name, access_code?, access_code_expires_at?, activated_at, is_active}`
- `POST /admin/users/{id}/access-code` → novo código
- `PATCH /admin/users/{id}` `{is_active}` 
- `POST /admin/territories` `{name, boundary:[{lat,lng},…]}` → `TerritoryOut`
- `GET /admin/territories` · `GET /admin/territories/{id}` (com quadras)
- `PATCH /admin/territories/{id}` `{name?, boundary?}` · `DELETE /admin/territories/{id}`
- `POST /admin/territories/{id}/blocks` `{number?, polygon:[{lat,lng},…]}`
- `PATCH /admin/blocks/{id}` · `DELETE /admin/blocks/{id}`
- `GET /admin/blocks/{id}/work-logs` · `DELETE /admin/work-logs/{id}`

**App — `Authorization: Bearer <token de app>`**
- `GET /app/territories` → territórios da congregação com quadras e `last_worked_at`
- `POST /app/blocks/{id}/worked` `{log_id, worked_at}` → 201 (ou 200 se `log_id` já existe)

**Regra transversal:** recurso de outra congregação responde **404**, nunca 403.

### Testes

- Rodam contra **PostGIS real**, nunca mock de geometria.
- `docker-compose.dev.yml` sobe o banco em `localhost:5432` com dois databases:
  `territory_map` e `territory_map_test`.
- Fixture de sessão aplica `alembic upgrade head` uma vez; cada teste roda em transação com
  rollback.
- Relógio sempre injetado (`now_provider`), nunca `datetime.now()` dentro de service.
- Meta: **100% de cobertura nos services**.

---

## Tasks

### Task 01 — Scaffold do servidor, Dockerfile e Compose

**Objetivo:** Projeto Python instalável, API subindo com `/health`, PostGIS rodando em container.
**Camadas:** Infra, Core (config)
**Modo:** direto
**Depende de:** —

**Instrução para o subagente:**
> Spec 0001 — Task 01: Crie o scaffold do servidor em `server/`. Entregue: (1) `pyproject.toml` para uv, Python 3.12, com fastapi, uvicorn[standard], sqlalchemy>=2, psycopg[binary], geoalchemy2, alembic, pydantic>=2, pydantic-settings, passlib[bcrypt], python-jose[cryptography], shapely, slowapi, apscheduler, e no grupo dev pytest, pytest-cov, httpx, ruff; (2) `app/core/config.py` com `Settings` via pydantic-settings lendo `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`, `JWT_ALGORITHM` (default HS256), `ADMIN_TOKEN_TTL_HOURS` (default 12), `ACCESS_CODE_TTL_HOURS` (default 24), `CORS_ORIGINS`; (3) `app/main.py` criando o FastAPI com título "Territory Map API" e um `GET /health` retornando `{"status":"ok"}`; (4) `server/Dockerfile` multi-stage baseado em `python:3.12-slim`, instalando via uv, rodando uvicorn, com usuário não-root; (5) `docker-compose.dev.yml` na raiz do repositório com apenas o serviço `db` usando `postgis/postgis:16-3.4`, porta 5432, volume nomeado, e um script de init que cria os databases `territory_map` e `territory_map_test` com a extensão postgis habilitada nos dois; (6) `docker-compose.yml` na raiz com `db` + `api`, a api lendo `.env`, `restart: unless-stopped` e `depends_on` com healthcheck do banco; (7) `server/.env.example`; (8) `.gitignore` na raiz cobrindo Python, uv, Flutter e `.env`; (9) `ruff.toml` ou seção `[tool.ruff]` com line-length 100. Critério de sucesso: `docker compose -f docker-compose.dev.yml up -d` sobe o banco e `uv run uvicorn app.main:app` responde 200 em `/health`. Toque apenas em infraestrutura e `app/core/config.py` e `app/main.py`; não crie models, schemas, repositories, services nem outros routers.

---

### Task 02 — Sessão do banco, Alembic e exceções de domínio

**Objetivo:** Base para persistência e vocabulário de erro do domínio.
**Camadas:** Core
**Modo:** direto
**Depende de:** Task 01

**Instrução para o subagente:**
> Spec 0001 — Task 02: Em `server/`, crie: (1) `app/models/base.py` com a `DeclarativeBase` do SQLAlchemy 2.x e um mixin com `id: UUID` (default `uuid4`) e `created_at: datetime` (server default `now()`, timezone-aware); (2) `app/core/db.py` com o `engine` síncrono (psycopg 3), `SessionLocal` e a dependência `get_session()` que abre sessão, faz commit no sucesso, rollback na exceção e sempre fecha; (3) Alembic inicializado em `server/migrations/` com `alembic.ini`, `env.py` lendo a URL de `Settings` e importando `Base.metadata`, configurado com `compare_type=True` e `include_object` ignorando as tabelas internas do PostGIS (`spatial_ref_sys`); (4) a primeira migration, contendo apenas `CREATE EXTENSION IF NOT EXISTS postgis`; (5) `app/core/exceptions.py` com a base `DomainError` e as subclasses `NotFoundError`, `InvalidCredentialsError`, `InvalidAccessCodeError`, `InactiveUserError`, `InvalidPolygonError`, `TerritoryOverlapError`, `BlockOutsideTerritoryError`, `BlockOverlapError`, `DuplicateBlockNumberError`, `DuplicateNameError`, `InvalidWorkedAtError` — cada uma carregando uma mensagem em português voltada ao admin e um `code` string estável. Critério de sucesso: `alembic upgrade head` roda limpo contra o banco de desenvolvimento. Toque apenas em `app/core/` , `app/models/base.py` e `migrations/`; não crie entidades concretas.

---

### Task 03 — Models Congregation e User

**Objetivo:** Entidades de identidade mapeadas.
**Camadas:** Models
**Modo:** direto
**Depende de:** Task 02

**Instrução para o subagente:**
> Spec 0001 — Task 03: Crie `server/app/models/congregation.py` e `server/app/models/user.py` com SQLAlchemy 2.x (`Mapped`/`mapped_column`), herdando de `Base` e do mixin de `app/models/base.py`. `Congregation`: `name: str`, `city: str`, `password_hash: str`, unique composto em `(name, city)`, relação `users` e `territories` com `cascade="all, delete-orphan"`. `User`: `congregation_id` FK com `ondelete="CASCADE"` e índice, `name: str`, `access_code: str | None` (nullable), `access_code_expires_at: datetime | None`, `activated_at: datetime | None`, `token_version: int` default 0 e `nullable=False`, `is_active: bool` default `True`. Crie um **índice único parcial** em `access_code` com `postgresql_where=access_code IS NOT NULL`. Não escreva migration nesta task. Toque apenas em `app/models/`; não altere schemas, repositories, services nem routers.

---

### Task 04 — Models Territory, Block e BlockWorkLog

**Objetivo:** Entidades geográficas e o log de trabalho mapeados.
**Camadas:** Models
**Modo:** direto
**Depende de:** Task 02 · **paralelizável com Task 03**

**Instrução para o subagente:**
> Spec 0001 — Task 04: Crie `server/app/models/territory.py`, `block.py` e `block_work_log.py` com SQLAlchemy 2.x e GeoAlchemy2. `Territory`: `congregation_id` FK `ondelete="CASCADE"` indexado, `name: str`, `boundary: Geometry("POLYGON", srid=4326, spatial_index=True)`, unique composto em `(congregation_id, name)`, relação `blocks` com cascade delete-orphan. `Block`: `territory_id` FK `ondelete="CASCADE"` indexado, `number: int`, `polygon: Geometry("POLYGON", srid=4326, spatial_index=True)`, `last_worked_at: datetime | None`, unique composto em `(territory_id, number)`. `BlockWorkLog`: `block_id` FK `ondelete="CASCADE"`, `user_id` FK **`ondelete="RESTRICT"`** (o histórico não pode sumir junto com o usuário), `worked_at: datetime`, índice em `(block_id, worked_at DESC)`. O `id` do `BlockWorkLog` é fornecido pelo cliente, então **não** use default automático nesse campo — ele é PK vinda de fora. Não escreva migration nesta task. Toque apenas em `app/models/`; não altere outras camadas.

---

### Task 05 — Migration inicial do schema

**Objetivo:** Schema completo versionado e aplicável.
**Camadas:** Models (migrations)
**Modo:** direto
**Depende de:** Task 03, Task 04

**Instrução para o subagente:**
> Spec 0001 — Task 05: Gere a migration Alembic com todas as tabelas de `app/models/` (`congregations`, `users`, `territories`, `blocks`, `block_work_logs`). Use `alembic revision --autogenerate` como ponto de partida, mas **revise o arquivo à mão**: o autogenerate do GeoAlchemy2 costuma duplicar a criação do índice espacial e emitir `DROP INDEX` espúrio para `idx_*_geom` — remova as duplicatas e garanta que os índices GIST das colunas geométricas existam exatamente uma vez. Confira também que o índice único parcial de `users.access_code` saiu com o `WHERE access_code IS NOT NULL`. Implemente `downgrade()` de verdade. Critério de sucesso: contra um banco limpo, `alembic upgrade head` seguido de `alembic downgrade base` e `alembic upgrade head` novamente roda sem erro, e um segundo `--autogenerate` não detecta diferença alguma. Toque apenas em `migrations/`.

---

### Task 06 — Segurança: senha, código de acesso e tokens

**Objetivo:** Primitivas de segurança testadas isoladamente.
**Camadas:** Core
**Modo:** TDD
**Depende de:** Task 01 · **paralelizável com Tasks 03–05**

**Instrução para o subagente:**
> Spec 0001 — Task 06: Implemente por TDD `server/app/core/security.py`. Funções: `hash_password(raw) -> str` e `verify_password(raw, hash) -> bool` com bcrypt via passlib; `generate_access_code(length=8) -> str`; `create_admin_token(congregation_id, now) -> str`; `create_app_token(user_id, congregation_id, token_version) -> str`; `decode_token(token) -> dict`. Critérios de aceite como comportamentos observáveis: (a) `verify_password` aceita a senha correta e rejeita a errada; (b) dois hashes da mesma senha são diferentes entre si (salt) e ambos verificam; (c) `generate_access_code` devolve 8 caracteres, **todos** pertencentes ao alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — sem `0`, `O`, `1`, `I`, `L`; (d) 1000 chamadas de `generate_access_code` produzem pelo menos 999 valores distintos; (e) usa `secrets`, não `random`; (f) token de admin decodifica trazendo `congregation_id`, `type == "admin"` e um `exp` de 12h à frente do `now` injetado; (g) token de admin expirado levanta erro ao decodificar; (h) token de app decodifica trazendo `user_id`, `congregation_id`, `token_version`, `type == "app"` e **sem** `exp`; (i) token assinado com outra chave é rejeitado; (j) string arbitrária é rejeitada. O tempo é sempre recebido como parâmetro, nunca lido de `datetime.now()` dentro do módulo. Toque apenas em `app/core/security.py` e `tests/core/test_security.py`.

---

### Task 07 — Geo: conversão de coordenadas e pré-validação de polígono

**Objetivo:** Fronteira única entre `(lat,lng)` e a representação do PostGIS.
**Camadas:** Core
**Modo:** TDD
**Depende de:** Task 01 · **paralelizável com Tasks 03–06**

**Instrução para o subagente:**
> Spec 0001 — Task 07: Implemente por TDD `server/app/core/geo.py`. Conteúdo: o dataclass congelado `LatLng(lat: float, lng: float)`; `points_to_wkt(points: list[LatLng]) -> str` gerando `POLYGON((lng lat, …))` **fechado** (primeiro ponto repetido no fim); `wkt_to_points(wkt) -> list[LatLng]` como inverso, **sem** repetir o ponto de fechamento; `validate_polygon(points)` levantando `InvalidPolygonError` de `app/core/exceptions.py` quando inválido. Critérios de aceite: (a) ida e volta de um quadrado preserva os pontos na ordem; (b) o WKT gerado inverte a ordem para `lng lat` e fecha o anel; (c) se a lista de entrada já vier fechada, o WKT não duplica o fechamento; (d) menos de 3 pontos distintos → `InvalidPolygonError`; (e) polígono em forma de "8" (auto-interseção) → `InvalidPolygonError`, usando Shapely `is_valid`/`is_simple`; (f) `lat` fora de [-90, 90] ou `lng` fora de [-180, 180] → `InvalidPolygonError`; (g) pontos consecutivos idênticos são tolerados desde que sobrem 3 distintos; (h) a mensagem do erro diz **qual** regra falhou. Este módulo não importa SQLAlchemy nem FastAPI. Toque apenas em `app/core/geo.py` e `tests/core/test_geo.py`.

---

### Task 08 — Schemas Pydantic (DTOs)

**Objetivo:** Contratos de entrada e saída com validação de forma.
**Camadas:** DTOs
**Modo:** TDD
**Depende de:** Task 07

**Instrução para o subagente:**
> Spec 0001 — Task 08: Implemente por TDD os DTOs Pydantic v2 em `server/app/schemas/`, seguindo o contrato da API descrito na spec 0001: `geo.py` (`LatLngIn/Out`), `auth.py` (`LoginIn`, `TokenOut`, `CongregationOut`), `user.py` (`UserCreateIn`, `UserOut`, `UserPatchIn`, `AccessCodeOut`, `ActivateIn`, `ActivateOut`), `territory.py` (`TerritoryCreateIn`, `TerritoryPatchIn`, `TerritoryOut`), `block.py` (`BlockCreateIn`, `BlockPatchIn`, `BlockOut`), `work_log.py` (`WorkedIn`, `WorkLogOut`). Regras: todo campo de texto usa `str` com `min_length`/`max_length` e faz `strip`; `boundary` e `polygon` são `list[LatLngIn]` com `min_length=3`; `lat` é `Field(ge=-90, le=90)` e `lng` `Field(ge=-180, le=180)`; `number` é `int` `ge=1`; `access_code` chega em maiúsculas (normalize com um validator, aceitando minúsculas do usuário); `WorkedIn` tem `log_id: UUID` e `worked_at: datetime` **obrigatoriamente timezone-aware** (rejeite naive). `UserOut` **nunca** inclui `token_version`; `CongregationOut` **nunca** inclui `password_hash`. Critérios de aceite: cada regra acima tem um teste que passa um valor válido e um inválido, verificando que o inválido levanta `ValidationError`; um teste garante que `UserOut` construído a partir de um objeto com `password_hash`/`token_version` não expõe esses campos. Esta camada valida **forma**, nunca regra de negócio — não consulte banco nem chame service. Toque apenas em `app/schemas/` e `tests/schemas/`.

---

### Task 09 — Repositories de Congregation e User

**Objetivo:** Acesso a dados de identidade.
**Camadas:** Repositories
**Modo:** direto
**Depende de:** Task 05

**Instrução para o subagente:**
> Spec 0001 — Task 09: Crie `server/app/repositories/congregation.py` e `user.py`. Cada repositório é uma classe que recebe a `Session` no construtor. `CongregationRepository`: `get_by_name_and_city(name, city)`, `get(id)`, `create(...)`. `UserRepository`: `get(id)`, `get_by_access_code(code)` (ignora código nulo), `list_by_congregation(congregation_id)`, `create(...)`, `set_access_code(user, code, expires_at)`, `redeem_code(user, now)` — que numa única operação zera `access_code`/`access_code_expires_at`, grava `activated_at` e incrementa `token_version` —, `set_active(user, is_active)`, `expire_codes(now)` que limpa em lote os códigos vencidos e devolve a quantidade afetada. Nenhum método decide regra de negócio, valida credencial ou levanta exceção de domínio: quem não achou devolve `None`. Nenhum método faz `commit` — a transação é da sessão. Toque apenas em `app/repositories/`; não altere models, services nem routers.

---

### Task 10 — Repositories geográficos com PostGIS

**Objetivo:** Todas as consultas espaciais isoladas numa camada só.
**Camadas:** Repositories
**Modo:** direto
**Depende de:** Task 05 · **paralelizável com Task 09**

**Instrução para o subagente:**
> Spec 0001 — Task 10: Crie `server/app/repositories/territory.py`, `block.py` e `block_work_log.py`, cada um recebendo a `Session` no construtor e trabalhando com WKT/`ST_GeomFromText(:wkt, 4326)`. `TerritoryRepository`: CRUD por congregação, `get_by_name`, e **`find_overlapping(congregation_id, wkt, exclude_id=None)`** devolvendo os territórios da mesma congregação que se sobrepõem — o predicado é `ST_Intersects(boundary, g) AND NOT ST_Touches(boundary, g)`, de modo que encostar na divisa **não** conta. `BlockRepository`: CRUD por território, `next_free_number(territory_id)` devolvendo o menor inteiro ≥1 ainda não usado, `is_within_territory(territory_id, wkt)` usando `ST_Within(g, boundary)`, `find_overlapping(territory_id, wkt, exclude_id=None)` com o mesmo predicado de interseção-sem-toque, e `find_outside_boundary(territory_id, new_boundary_wkt)` devolvendo as quadras que ficariam fora de uma nova demarcação. `BlockWorkLogRepository`: `get(id)`, `create(...)`, `list_by_block(block_id)`, `delete(log)`, `latest_worked_at(block_id)`. Todos os predicados espaciais rodam **no banco**, nunca em Python. Nenhum método faz commit nem levanta exceção de domínio. Toque apenas em `app/repositories/`; não altere outras camadas.

---

### Task 11 — Service de autenticação do admin

**Objetivo:** Login validando nome, cidade e senha em conjunto.
**Camadas:** Services
**Modo:** TDD
**Depende de:** Task 06, Task 08, Task 09

**Instrução para o subagente:**
> Spec 0001 — Task 11: Implemente por TDD `server/app/services/auth.py` com `AuthService`, recebendo `CongregationRepository`, um `now_provider` e as funções de `app/core/security.py`. Método `login(name, city, password, now) -> (congregation, token)`. Critérios de aceite: (a) nome, cidade e senha corretos devolvem a congregação e um JWT de admin válido, decodificável e com o `congregation_id` certo; (b) nome errado, cidade errada e senha errada levantam **a mesma** `InvalidCredentialsError`, com a mesma mensagem — um teste deve comparar as três mensagens e afirmar que são idênticas; (c) nome e cidade certos de congregações diferentes não se misturam: com duas congregações de mesmo nome em cidades distintas, a senha de uma não autentica a outra; (d) `verify_password` é chamado **mesmo quando a congregação não existe**, comparando contra um hash descartável, para que o tempo de resposta não revele a existência do registro — verifique isso com um dublê que conta chamadas; (e) o service não constrói `HTTPException` nem importa FastAPI. Toque apenas em `app/services/auth.py` e `tests/services/test_auth_service.py`.

---

### Task 12 — Service de publicador e código de acesso

**Objetivo:** Ciclo de vida do usuário e do código descartável.
**Camadas:** Services
**Modo:** TDD
**Depende de:** Task 06, Task 08, Task 09

**Instrução para o subagente:**
> Spec 0001 — Task 12: Implemente por TDD `server/app/services/user.py` com `UserService` (recebe `UserRepository`, `now_provider` e as funções de segurança). Métodos: `create(congregation_id, name, now)`, `regenerate_code(congregation_id, user_id, now)`, `list(congregation_id)`, `set_active(congregation_id, user_id, is_active)`, `activate(code, now) -> (user, token)`, `expire_codes(now)`. Critérios de aceite: (a) criar usuário gera código de 8 caracteres com validade de 24h a partir do `now` injetado, `activated_at` nulo e `token_version` 0; (b) resgatar um código válido devolve um token de app decodificável, grava `activated_at`, **zera o `access_code`** e incrementa `token_version`; (c) resgatar o **mesmo** código de novo levanta `InvalidAccessCodeError`; (d) código inexistente, código expirado (`now` além da validade) e código já resgatado levantam a mesma exceção **com a mesma mensagem** — teste que as três são idênticas; (e) regenerar código para quem já ativou funciona, e o código anterior deixa de valer; (f) um novo resgate incrementa `token_version` de novo, e o token emitido antes passa a ter versão defasada; (g) resgatar código de usuário com `is_active=False` levanta `InactiveUserError`; (h) `create`/`regenerate`/`set_active` sobre usuário de **outra** congregação levantam `NotFoundError`; (i) `expire_codes` limpa apenas os vencidos e não tocados, deixando intactos os válidos e os já resgatados; (j) o código gerado nunca aparece em nenhuma mensagem de exceção. Toque apenas em `app/services/user.py` e `tests/services/test_user_service.py`.

---

### Task 13 — Service de território

**Objetivo:** Demarcação válida, única no nome e sem sobreposição.
**Camadas:** Services
**Modo:** TDD
**Depende de:** Task 07, Task 08, Task 10

**Instrução para o subagente:**
> Spec 0001 — Task 13: Implemente por TDD `server/app/services/territory.py` com `TerritoryService` (recebe `TerritoryRepository`, `BlockRepository` e `now_provider`). Métodos `create`, `get`, `list`, `update`, `delete`, todos escopados por `congregation_id`. Os testes deste service rodam contra **PostGIS real** (fixture do banco de teste), porque os predicados são do banco — não mocke geometria. Critérios de aceite: (a) criar território com polígono válido persiste e devolve os pontos na mesma ordem em que entraram; (b) polígono com menos de 3 pontos ou auto-interseção levanta `InvalidPolygonError`; (c) criar território que **se sobrepõe** a outro da mesma congregação levanta `TerritoryOverlapError`; (d) criar território que apenas **encosta** na divisa de outro (compartilha aresta, interiores disjuntos) **é aceito**; (e) território de **outra** congregação com a mesma área não bloqueia; (f) nome repetido na mesma congregação levanta `DuplicateNameError`, mas o mesmo nome em congregação diferente é aceito; (g) atualizar a demarcação de um território **não** conflita consigo mesmo (o próprio é excluído da checagem de sobreposição); (h) atualizar a demarcação de um território que já tem quadras, deixando alguma quadra fora do novo contorno, levanta `BlockOutsideTerritoryError` cuja mensagem **lista os números** das quadras afetadas; (i) a mesma atualização é aceita quando todas as quadras continuam dentro; (j) `get`/`update`/`delete` de território de outra congregação levantam `NotFoundError`; (k) apagar território apaga suas quadras em cascata. Toque apenas em `app/services/territory.py` e `tests/services/test_territory_service.py`.

---

### Task 14 — Service de quadra

**Objetivo:** Quadra sempre dentro do território, sem sobreposição e numerada.
**Camadas:** Services
**Modo:** TDD
**Depende de:** Task 13

**Instrução para o subagente:**
> Spec 0001 — Task 14: Implemente por TDD `server/app/services/block.py` com `BlockService` (recebe `BlockRepository`, `TerritoryRepository`, `now_provider`), rodando contra PostGIS real. Métodos `create`, `list`, `update`, `delete`, escopados por `congregation_id` através do território. Critérios de aceite: (a) criar quadra inteiramente dentro do território persiste e recebe o número sugerido quando `number` não é informado; (b) a numeração automática é o **menor inteiro ≥1 livre** — com as quadras 1, 2 e 4 existentes, a próxima é 3; (c) `number` informado pelo admin é respeitado, inclusive fora de sequência; (d) `number` repetido no mesmo território levanta `DuplicateBlockNumberError`, mas o mesmo número em outro território é aceito; (e) quadra com **um único vértice** fora do contorno do território levanta `BlockOutsideTerritoryError`; (f) quadra que coincide exatamente com o contorno do território é aceita (`ST_Within` inclui a borda); (g) quadra sobrepondo outra do mesmo território levanta `BlockOverlapError`; (h) quadra que apenas encosta em outra é aceita; (i) polígono inválido levanta `InvalidPolygonError`; (j) criar quadra em território de outra congregação levanta `NotFoundError`; (k) atualizar o polígono de uma quadra não a compara consigo mesma; (l) `last_worked_at` de uma quadra recém-criada é `None`. Toque apenas em `app/services/block.py` e `tests/services/test_block_service.py`.

---

### Task 15 — Service de registro de trabalho

**Objetivo:** Log append-only, idempotente e com `last_worked_at` derivado.
**Camadas:** Services
**Modo:** TDD
**Depende de:** Task 10, Task 12

**Instrução para o subagente:**
> Spec 0001 — Task 15: Implemente por TDD `server/app/services/work_log.py` com `WorkLogService` (recebe `BlockWorkLogRepository`, `BlockRepository`, `now_provider`). Métodos: `mark_worked(log_id, block_id, user, worked_at, now)`, `list_by_block(congregation_id, block_id)`, `delete(congregation_id, log_id)`. Critérios de aceite: (a) marcar uma quadra cria o log e atualiza `Block.last_worked_at` para o `worked_at` informado; (b) reenviar o **mesmo `log_id`** não cria registro novo e não altera nada — devolve o log existente e sinaliza que já existia (idempotência do reenvio offline); (c) duas marcações da mesma pessoa no mesmo bloco com `log_id` diferentes criam **dois** registros; (d) marcar com um `worked_at` **anterior** ao `last_worked_at` atual cria o log mas **não** rebaixa `last_worked_at` — ele é sempre o máximo; (e) `worked_at` no futuro em relação ao `now` injetado levanta `InvalidWorkedAtError`; (f) `worked_at` mais de 90 dias antes do `now` levanta `InvalidWorkedAtError`; (g) marcar quadra de outra congregação levanta `NotFoundError`; (h) apagar um log recalcula `last_worked_at` a partir do log remanescente mais recente; (i) apagar o **último** log de uma quadra devolve `last_worked_at` para `None`; (j) o histórico de um usuário desativado continua listável. Toque apenas em `app/services/work_log.py` e `tests/services/test_work_log_service.py`.

---

### Task 16 — Dependências de autenticação

**Objetivo:** Separar de verdade o que o admin pode do que o app pode.
**Camadas:** Core (deps)
**Modo:** TDD
**Depende de:** Task 06, Task 09

**Instrução para o subagente:**
> Spec 0001 — Task 16: Implemente por TDD `server/app/core/deps.py` com as dependências FastAPI `current_congregation` (token de admin) e `current_app_user` (token de app), ambas lendo `Authorization: Bearer`. Critérios de aceite: (a) token de admin válido resolve a congregação; (b) token de admin expirado, malformado, ausente ou assinado com outra chave → 401; (c) **token de app não é aceito** por `current_congregation` e **token de admin não é aceito** por `current_app_user` — o campo `type` do payload é conferido; (d) token de app válido resolve o usuário e a congregação dele; (e) token de app cujo `token_version` é **menor** que o do banco → 401 (aparelho antigo depois de um novo resgate); (f) token de app de usuário com `is_active=False` → 401; (g) o corpo da resposta 401 é sempre a mesma mensagem genérica, sem dizer qual das condições falhou; (h) toda checagem de `is_active`/`token_version` bate no banco a cada chamada. Escreva os testes com um app FastAPI mínimo montado no próprio teste, expondo duas rotas protegidas. Toque apenas em `app/core/deps.py` e `tests/core/test_deps.py`.

---

### Task 17 — Rotas de login e de publicadores

**Objetivo:** Expor autenticação e gestão de usuários.
**Camadas:** Routers
**Modo:** direto
**Depende de:** Task 11, Task 12, Task 16

**Instrução para o subagente:**
> Spec 0001 — Task 17: Crie `server/app/routers/auth.py` (com `POST /auth/login` e `POST /app/activate`) e `server/app/routers/admin_users.py` (`POST /admin/users`, `GET /admin/users`, `POST /admin/users/{id}/access-code`, `PATCH /admin/users/{id}`), seguindo o contrato da spec 0001, e registre-os em `app/main.py`. Crie também, em `app/main.py`, um **exception handler** único para `DomainError` que traduz: `NotFoundError`→404, `InvalidCredentialsError`/`InvalidAccessCodeError`/`InactiveUserError`→401, `DuplicateNameError`/`DuplicateBlockNumberError`→409, e as demais `DomainError`→422, sempre respondendo `{"code": <code>, "detail": <mensagem>}`. Os routers não contêm regra de negócio: montam o service com as dependências de `app/core/deps.py` e `get_session`, chamam um método e devolvem o DTO. Nenhum endpoint recebe `congregation_id` no corpo ou na URL — ele vem sempre do token. Cubra as rotas com testes de rota usando `httpx.ASGITransport`, verificando os status codes acima e que a resposta de `POST /admin/users` traz o `access_code`, enquanto o login **nunca** devolve `password_hash`. Toque apenas em `app/routers/auth.py`, `app/routers/admin_users.py`, `app/main.py` e os testes correspondentes.

---

### Task 18 — Rotas de território, quadra e histórico (admin)

**Objetivo:** Expor todo o CRUD geográfico do admin.
**Camadas:** Routers
**Modo:** direto
**Depende de:** Task 13, Task 14, Task 15, Task 16

**Instrução para o subagente:**
> Spec 0001 — Task 18: Crie `server/app/routers/admin_territories.py` (`POST`/`GET`/`GET {id}`/`PATCH`/`DELETE` em `/admin/territories`) e `server/app/routers/admin_blocks.py` (`POST /admin/territories/{id}/blocks`, `PATCH /admin/blocks/{id}`, `DELETE /admin/blocks/{id}`, `GET /admin/blocks/{id}/work-logs`, `DELETE /admin/work-logs/{id}`), conforme o contrato da spec 0001, e registre-os em `app/main.py`. Todas as rotas exigem a dependência de admin e derivam a congregação do token; recurso de outra congregação responde **404**. `GET /admin/territories/{id}` devolve o território com suas quadras. O tratamento de erro reaproveita o handler de `DomainError` criado na Task 17 — não crie outro. Escreva testes de rota cobrindo: criação bem-sucedida, 422 em polígono inválido, 422 em sobreposição de território, 409 em número de quadra duplicado, 404 em recurso de outra congregação e 401 sem token. Toque apenas em `app/routers/admin_territories.py`, `app/routers/admin_blocks.py`, o registro em `app/main.py` e os testes correspondentes.

---

### Task 19 — Rotas do app cliente

**Objetivo:** A superfície mínima que o Flutter consome.
**Camadas:** Routers
**Modo:** direto
**Depende de:** Task 13, Task 15, Task 16, Task 17

**Instrução para o subagente:**
> Spec 0001 — Task 19: Crie `server/app/routers/app_client.py` com `GET /app/territories` (todos os territórios da congregação do token, cada um com suas quadras, incluindo `number`, `polygon` e `last_worked_at`) e `POST /app/blocks/{id}/worked` (corpo `{log_id, worked_at}`, respondendo **201** quando cria e **200** quando o `log_id` já existia), e registre-o em `app/main.py`. Ambas usam a dependência de token de app. Escreva testes de rota cobrindo: leitura devolve só os territórios da congregação do token; marcação cria o log e reflete `last_worked_at` na leitura seguinte; reenvio do mesmo `log_id` responde 200 sem duplicar; marcar quadra de outra congregação responde 404; token de **admin** nessas rotas responde 401; e — o mais importante — **nenhuma rota de escrita de `/admin/*` aceita um token de app**, verificado com uma tentativa de `POST /admin/territories` usando token de app, que deve responder 401. Toque apenas em `app/routers/app_client.py`, o registro em `app/main.py` e os testes correspondentes.

---

### Task 20 — Rate limit e expiração automática de códigos

**Objetivo:** Fechar as duas pontas operacionais de segurança.
**Camadas:** Core, Jobs
**Modo:** TDD
**Depende de:** Task 12, Task 17, Task 19

**Instrução para o subagente:**
> Spec 0001 — Task 20: Implemente por TDD (1) rate limit com `slowapi` aplicado a `POST /app/activate` (10 requisições por minuto por IP) e `POST /auth/login` (5 por minuto por IP), com handler devolvendo **429** e um corpo no mesmo formato dos demais erros; (2) `server/app/jobs/expire_codes.py`, executável como `python -m app.jobs.expire_codes`, que abre uma sessão e chama `UserService.expire_codes`, registrando quantos códigos foram limpos; (3) `server/app/core/scheduler.py` iniciando um `BackgroundScheduler` no `lifespan` do FastAPI que roda esse job de hora em hora e é desligado no shutdown. Critérios de aceite: (a) na 11ª chamada seguida a `/app/activate` a resposta é 429; (b) na 6ª chamada seguida a `/auth/login` a resposta é 429; (c) o limite é por IP — dois IPs distintos não compartilham a cota; (d) o job limpa códigos vencidos e devolve a contagem correta; (e) o job é idempotente: rodar duas vezes seguidas limpa 0 na segunda; (f) o job não toca em códigos válidos nem em usuários já ativados; (g) o scheduler é iniciado e encerrado pelo `lifespan` — teste que o app sobe e desce sem deixar thread pendurada. Documente que, com múltiplos workers uvicorn, o job roda uma vez por worker, o que é inofensivo por ser idempotente. Toque apenas em `app/core/scheduler.py`, `app/jobs/`, o wiring do rate limit em `app/main.py` e os testes correspondentes.

---

### Task 21 — Testes de integração ponta a ponta

**Objetivo:** Provar os fluxos completos que nenhum teste unitário cobre.
**Camadas:** Testes
**Modo:** direto
**Depende de:** Task 17, Task 18, Task 19, Task 20

**Instrução para o subagente:**
> Spec 0001 — Task 21: Escreva em `server/tests/integration/` os testes ponta a ponta, usando o app FastAPI real e o PostGIS real, cada teste partindo de banco limpo. Fluxos: (1) **caminho completo** — criar congregação por fixture, logar como admin, cadastrar publicador, resgatar o código no papel do app, o app lê os territórios, o admin desenha um território e duas quadras, o app relê e enxerga as quadras, o app marca a quadra 1 como trabalhada, o admin vê o log com o nome do publicador e o `last_worked_at` correto; (2) **troca de aparelho** — publicador ativo, admin gera novo código, o segundo resgate emite novo token, o **token antigo passa a responder 401** e o token novo funciona; (3) **isolamento entre congregações** — duas congregações com territórios sobrepostos geograficamente, cada admin enxerga apenas os seus, e o token de uma responde 404 ao tentar ler ou marcar recurso da outra; (4) **integridade da demarcação** — território com quadras, tentativa de encolher o contorno deixando uma quadra fora responde 422 citando o número da quadra, e o estado no banco permanece **inalterado** depois da falha; (5) **revogação** — admin desativa o publicador e o token dele passa a responder 401, mas o histórico de trabalho dele continua visível para o admin. Não altere código de produção nesta task; se um teste falhar por bug real, registre o problema no relatório em vez de contornar. Toque apenas em `tests/integration/`.

---

### Task 22 — CI/CD: testes, imagem e deploy por SSH

**Objetivo:** Push na `main` roda tudo e publica na VPS.
**Camadas:** Infra
**Modo:** direto
**Depende de:** Task 21

**Instrução para o subagente:**
> Spec 0001 — Task 22: Crie `.github/workflows/server.yml`. Job **test**: dispara em `push` e `pull_request` com `paths: server/**` e o próprio workflow; sobe `postgis/postgis:16-3.4` como *service container* com healthcheck; instala uv com cache; roda `ruff check` e `ruff format --check`; aplica `alembic upgrade head`; roda `pytest --cov=app --cov-report=term-missing`; **falha o job se a cobertura de `app/services/` ficar abaixo de 100%**. Job **build-and-deploy**: só em `push` na `main`, `needs: test`; constrói a imagem com Buildx e cache de layers e publica em **GHCR** com as tags `latest` e o SHA do commit, usando `GITHUB_TOKEN`; em seguida conecta por SSH (`appleboy/ssh-action`) e executa no diretório de deploy `docker compose pull && docker compose up -d && docker image prune -f`. Parametrize com os secrets `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT` e a variável `DEPLOY_PATH`. Ajuste `docker-compose.yml` para consumir a imagem do GHCR em vez de construir localmente, e faça o serviço `api` rodar `alembic upgrade head` antes do uvicorn no entrypoint. Crie `server/README.md` documentando os comandos locais e **listando exatamente quais secrets e variables precisam ser cadastrados no GitHub** — você não deve cadastrá-los nem pedir a chave privada a ninguém; deixe isso registrado como passo manual do usuário. Toque apenas em `.github/workflows/`, `docker-compose.yml`, `server/Dockerfile`, o entrypoint e `server/README.md`.

---

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0001
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências.

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo`:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

### Ordem e paralelismo

| Onda | Tasks | Observação |
|------|-------|------------|
| 1 | 01 | scaffold, bloqueia tudo |
| 2 | 02 | core + alembic |
| 3 | **03 ∥ 04 ∥ 06 ∥ 07** | models e primitivas, independentes entre si |
| 4 | **05 ∥ 08** | migration e DTOs |
| 5 | **09 ∥ 10** | repositories |
| 6 | **11 ∥ 12 ∥ 13 ∥ 16** | services de identidade, território e deps |
| 7 | **14 ∥ 15** | quadra e log de trabalho |
| 8 | **17 → 18 ∥ 19** | 17 cria o exception handler, então vem antes |
| 9 | 20 | rate limit e job |
| 10 | 21 | integração |
| 11 | 22 | CI/CD |

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução ao iniciar a primeira task
- `Concluída` → definido pela skill de execução quando a última task for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task._

- [x] Task 01 — Scaffold do servidor, Dockerfile e Compose → implements/0001
- [x] Task 02 — Sessão do banco, Alembic e exceções de domínio → implements/0002
- [x] Task 03 — Models Congregation e User → implements/0004
- [x] Task 04 — Models Territory, Block e BlockWorkLog → implements/0003
- [x] Task 05 — Migration inicial do schema → implements/0007
- [x] Task 06 — Segurança: senha, código de acesso e tokens → implements/0006
- [x] Task 07 — Geo: conversão de coordenadas e pré-validação de polígono → implements/0005
- [x] Task 08 — Schemas Pydantic (DTOs) → implements/0008
- [x] Task 09 — Repositories de Congregation e User → implements/0009
- [x] Task 10 — Repositories geográficos com PostGIS → implements/0010
- [x] Task 11 — Service de autenticação do admin → implements/0011
- [x] Task 12 — Service de publicador e código de acesso → implements/0013
- [x] Task 13 — Service de território → implements/0014
- [x] Task 14 — Service de quadra → implements/0016
- [x] Task 15 — Service de registro de trabalho → implements/0015
- [x] Task 16 — Dependências de autenticação → implements/0012
- [x] Task 17 — Rotas de login e de publicadores → implements/0017
- [x] Task 18 — Rotas de território, quadra e histórico (admin) → implements/0019
- [x] Task 19 — Rotas do app cliente → implements/0018
- [x] Task 20 — Rate limit e expiração automática de códigos → implements/0020
- [x] Task 21 — Testes de integração ponta a ponta → implements/0021
- [x] Task 22 — CI/CD: testes, imagem e deploy por SSH → implements/0022

**Pendência do usuário:** o workflow está pronto, mas o deploy só roda depois que os secrets
`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT` e a variable `DEPLOY_PATH` forem cadastrados
à mão em `Settings → Secrets and variables → Actions`. Instruções em `server/README.md`.
