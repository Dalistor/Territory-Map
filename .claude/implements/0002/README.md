# [0002] Sessão do banco, Alembic e exceções de domínio

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 02

## Solicitação

> Spec 0001 — Task 02: Em `server/`, crie: (1) `app/models/base.py` com a `DeclarativeBase` do
> SQLAlchemy 2.x e um mixin com `id: UUID` (default `uuid4`) e `created_at: datetime` (server
> default `now()`, timezone-aware); (2) `app/core/db.py` com o `engine` síncrono (psycopg 3),
> `SessionLocal` e a dependência `get_session()` que abre sessão, faz commit no sucesso, rollback na
> exceção e sempre fecha; (3) Alembic inicializado em `server/migrations/` com `alembic.ini`,
> `env.py` lendo a URL de `Settings` e importando `Base.metadata`, configurado com
> `compare_type=True` e `include_object` ignorando as tabelas internas do PostGIS
> (`spatial_ref_sys`); (4) a primeira migration, contendo apenas
> `CREATE EXTENSION IF NOT EXISTS postgis`; (5) `app/core/exceptions.py` com a base `DomainError` e
> as subclasses `NotFoundError`, `InvalidCredentialsError`, `InvalidAccessCodeError`,
> `InactiveUserError`, `InvalidPolygonError`, `TerritoryOverlapError`,
> `BlockOutsideTerritoryError`, `BlockOverlapError`, `DuplicateBlockNumberError`,
> `DuplicateNameError`, `InvalidWorkedAtError` — cada uma carregando uma mensagem em português
> voltada ao admin e um `code` string estável. Critério de sucesso: `alembic upgrade head` roda
> limpo contra o banco de desenvolvimento. Toque apenas em `app/core/`, `app/models/base.py` e
> `migrations/`; não crie entidades concretas.

## Contexto

A Task 01 entregou o scaffold (config, `/health`, Docker). Faltava tudo que sustenta a persistência:
a base declarativa que as Tasks 03 e 04 vão herdar, a sessão transacional que os routers vão
injetar, o versionamento de schema via Alembic, e o vocabulário de erro que os services das Tasks
11–15 vão lançar e o router da Task 17 vai traduzir para status HTTP.

Nada disso tem regra de negócio própria — é infraestrutura da camada Core, por isso modo direto e
não TDD.

## O que foi feito

**Base ORM.** `Base(DeclarativeBase)` mais dois mixins: `TimestampMixin` (só `created_at`) e
`EntityMixin(TimestampMixin)` (acrescenta o `id` UUID). A divisão existe porque o `BlockWorkLog` da
Task 04 tem PK vinda do cliente — ele usa só o `TimestampMixin` e declara o próprio `id`, sem
precisar sobrescrever nada.

**Sessão.** `engine` síncrono sobre psycopg 3 com `pool_pre_ping`, `SessionLocal` com
`autoflush=False` e `expire_on_commit=False`, e `get_session()` no formato de dependência FastAPI:
`yield` → `commit()`, `except` → `rollback()` + re-raise, `finally` → `close()`. Uma transação por
requisição; nenhuma camada abaixo comita.

**Alembic.** `alembic.ini` na raiz de `server/` apontando para `migrations/`, sem `sqlalchemy.url`
(quem fornece é o `env.py`, a partir de `Settings`). `env.py` com `target_metadata = Base.metadata`,
`compare_type=True`, `compare_server_default=True` e um `include_object` próprio.

**Primeira migration** (`8f81b08d3642`): só `CREATE EXTENSION IF NOT EXISTS postgis`.

**Exceções de domínio.** `DomainError` com `code` (string estável, contrato de API) e
`default_message` (português, voltada ao admin), mais as 11 subclasses pedidas.

## Arquivos modificados

- `server/migrations/env.py` — reescrito a partir do template do `alembic init`
- `server/alembic.ini` — reescrito, enxuto, sem `sqlalchemy.url`

## Arquivos criados

- `server/app/models/base.py` — `Base`, `TimestampMixin`, `EntityMixin`
- `server/app/models/__init__.py` — reexporta a base e serve de ponto único de registro dos models
- `server/app/core/db.py` — `engine`, `SessionLocal`, `get_session()`
- `server/app/core/exceptions.py` — `DomainError` + 11 subclasses
- `server/migrations/versions/20260802_1320_8f81b08d3642_enable_postgis.py` — primeira migration
- `server/migrations/script.py.mako`, `server/migrations/README` — gerados pelo `alembic init`

## Decisões técnicas

**Dois mixins em vez de um.** A task pedia "um mixin", mas a Task 04 exige um `BlockWorkLog` com
`id` fornecido pelo cliente. Separar `created_at` (`TimestampMixin`) do `id`
(`EntityMixin`, que herda o primeiro) atende as duas necessidades sem sobrescrita e sem duplicar a
coluna de auditoria.

**`created_at` com `server_default=func.now()`.** É o banco que carimba, não o Python: linhas
inseridas por migration ou à mão também ganham timestamp, e todas vêm do mesmo relógio. Coluna
`TIMESTAMP WITH TIME ZONE`, conforme verificado no DDL compilado.

**`id` com default client-side (`uuid4`), não `gen_random_uuid()`.** Mantém a geração idêntica em
qualquer ambiente e não amarra o schema a uma função do servidor. O valor é materializado no flush,
não na construção do objeto.

**`expire_on_commit=False`.** A partir do FastAPI 0.106 a dependência com `yield` é finalizada antes
da resposta ser enviada; com expiração no commit, qualquer acesso a atributo depois disso viraria
query numa sessão já fechada.

**URL do banco só no `env.py`.** Tirar `sqlalchemy.url` do `alembic.ini` deixa `Settings` como fonte
única e evita credencial em arquivo versionado. Efeito colateral útil: dá para apontar a migration
para o banco de teste só trocando a variável de ambiente
(`DATABASE_URL=... alembic upgrade head`), sem editar arquivo.

**`include_object` composto com o do GeoAlchemy2.** O filtro próprio remove as tabelas internas do
PostGIS (`spatial_ref_sys`, `geometry_columns`, `geography_columns`, `raster_columns`,
`raster_overviews`) e depois delega para `geoalchemy2.alembic_helpers.include_object`, que descarta
os índices espaciais que a própria lib já cria junto com a coluna. Somado a
`render_item` e `process_revision_directives=alembic_helpers.writer`, é exatamente o setup
recomendado pelo GeoAlchemy2 e ataca na origem o problema que a Task 05 antecipa (índice GIST
duplicado e `DROP INDEX idx_*` espúrio no autogenerate).

**Downgrade da primeira migration é no-op.** Dropar a extensão PostGIS derrubaria em cascata toda
coluna geométrica e o `spatial_ref_sys`, que pode ser compartilhado com outros schemas do mesmo
banco. Recriar a extensão é barato; perder dado por um `downgrade` não é.

**`app/models/__init__.py` como ponto de registro.** O autogenerate só enxerga o que está em
`Base.metadata` no momento do import. O `__init__.py` documenta em destaque que todo módulo de model
precisa ser importado ali — caso contrário a Task 05 geraria uma migration vazia sem erro nenhum.

**`DomainError` com `code` + `default_message`, e mensagem sobrescrevível no construtor.** O `code`
é o que o cliente inspeciona e o router mapeia para status; a mensagem é texto para humano. O
construtor aceita uma mensagem mais específica porque a Task 13 exige listar os números das quadras
que ficaram fora da nova demarcação — sem isso, o service teria que inventar uma exceção paralela.

**Mensagens genéricas onde a distinção vazaria informação.** `InvalidCredentialsError` não diz qual
dos três campos falhou e `InvalidAccessCodeError` cobre inexistente, expirado e já usado com o mesmo
texto — as Tasks 11 e 12 têm critérios de aceite que comparam essas mensagens e exigem que sejam
idênticas.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d      # na raiz
cd server
uv run alembic upgrade head
uv run alembic current                              # 8f81b08d3642 (head)
uv run alembic check                                # "No new upgrade operations detected."
uv run ruff check . && uv run ruff format --check .
```

Ciclo completo de ida e volta:

```bash
uv run alembic downgrade base && uv run alembic upgrade head
```

Banco de teste:

```bash
DATABASE_URL="postgresql+psycopg://territory:territory@localhost:5432/territory_map_test" \
  uv run alembic upgrade head
```

## Resultado da validação

- `alembic upgrade head` — limpo contra `territory_map` **e** `territory_map_test`. Critério de
  sucesso da task atendido.
- `alembic downgrade base` → `alembic upgrade head` — sem erro.
- `alembic check` — nenhuma operação pendente, o que confirma que o `include_object` está de fato
  ignorando as tabelas internas do PostGIS (sem ele, o autogenerate proporia dropar
  `spatial_ref_sys`).
- `postgis_version()` — `3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`.
- `get_session()` exercitado num script de fumaça: caminho feliz comita (tabela criada persistiu),
  exceção injetada com `gen.throw()` foi repropagada e o `INSERT` sumiu no rollback, sessão fechada
  nos dois casos.
- DDL compilado dos mixins conferido: `id UUID NOT NULL PRIMARY KEY` e
  `created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL`; `TimestampMixin` funciona isolado,
  com PK própria.
- Exceções: `code`/`message` corretos, `str(e) == e.message`, sobrescrita de mensagem funcionando,
  todas descendendo de `DomainError`.
- `app.main` continua importando e servindo `/health`.
- `ruff check` e `ruff format --check` — limpos.
- `pytest` — "no tests ran": o projeto ainda não tem suíte (Task 06 em diante). Esta task é
  estrutural e não introduziu comportamento testável de domínio, então nada foi escrito em
  `tests/`.
