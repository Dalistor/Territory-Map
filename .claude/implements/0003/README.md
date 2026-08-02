# [0003] Models Territory, Block e BlockWorkLog

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 04

## Solicitação

> Spec 0001 — Task 04: Crie `server/app/models/territory.py`, `block.py` e `block_work_log.py` com
> SQLAlchemy 2.x e GeoAlchemy2. `Territory`: `congregation_id` FK `ondelete="CASCADE"` indexado,
> `name: str`, `boundary: Geometry("POLYGON", srid=4326, spatial_index=True)`, unique composto em
> `(congregation_id, name)`, relação `blocks` com cascade delete-orphan. `Block`: `territory_id` FK
> `ondelete="CASCADE"` indexado, `number: int`, `polygon: Geometry("POLYGON", srid=4326,
> spatial_index=True)`, `last_worked_at: datetime | None`, unique composto em
> `(territory_id, number)`. `BlockWorkLog`: `block_id` FK `ondelete="CASCADE"`, `user_id` FK
> **`ondelete="RESTRICT"`** (o histórico não pode sumir junto com o usuário), `worked_at: datetime`,
> índice em `(block_id, worked_at DESC)`. O `id` do `BlockWorkLog` é fornecido pelo cliente, então
> **não** use default automático nesse campo — ele é PK vinda de fora. Não escreva migration nesta
> task. Toque apenas em `app/models/`; não altere outras camadas.

## Contexto

A Task 02 deixou pronta a `DeclarativeBase` e os mixins (`EntityMixin` com `id`/`created_at`,
`TimestampMixin` só com `created_at`), e a Task 03 mapeou `Congregation` e `User`. Faltavam as três
entidades que o resto da spec inteira consome: o território (a demarcação geográfica), a quadra
(a unidade real de trabalho em campo) e o log append-only de trabalho — a fonte de verdade do
"última vez trabalhada" que sobrevive à sincronização offline.

Sem elas, as tasks 05 (migration), 10 (repositories geográficos), 13/14/15 (services) não têm sobre
o que operar.

## O que foi feito

Três models SQLAlchemy 2.x (`Mapped`/`mapped_column`) com as colunas geométricas em GeoAlchemy2:

- **`Territory`** — FK indexada para `congregations` com `ON DELETE CASCADE`, `name` (VARCHAR 120),
  `boundary` como `geometry(POLYGON, 4326)` com índice GIST, unique composto
  `(congregation_id, name)`, relação `blocks` com `cascade="all, delete-orphan"` e o lado
  `congregation` que fecha o `back_populates="territories"` já declarado em `Congregation`.
- **`Block`** — FK indexada para `territories` com `ON DELETE CASCADE`, `number` inteiro,
  `polygon` como `geometry(POLYGON, 4326)` com índice GIST, `last_worked_at` nullable e
  timezone-aware, unique composto `(territory_id, number)`, relações `territory` e `work_logs`.
- **`BlockWorkLog`** — herda de `TimestampMixin` (não de `EntityMixin`) e declara o próprio
  `id: UUID` primary key **sem default nenhum**, nem Python nem servidor. `block_id` com
  `ON DELETE CASCADE`, `user_id` com `ON DELETE RESTRICT`, `worked_at` timezone-aware, e o índice
  composto `(block_id, worked_at DESC)`.

Os três foram registrados em `app/models/__init__.py`, sem o que o autogenerate do Alembic (Task 05)
não os enxergaria.

## Arquivos modificados

- `server/app/models/__init__.py` — importa e exporta `Territory`, `Block` e `BlockWorkLog`, ao lado
  dos que a Task 03 já havia registrado

## Arquivos criados

- `server/app/models/territory.py` — entidade `Territory`, tabela `territories`
- `server/app/models/block.py` — entidade `Block`, tabela `blocks`
- `server/app/models/block_work_log.py` — entidade `BlockWorkLog`, tabela `block_work_logs`

## Decisões técnicas

**`BlockWorkLog` não usa o `EntityMixin`.** O mixin injeta `default=uuid4`, e um default silencioso
aqui seria um bug de dados, não uma conveniência: o `id` do log é gerado pelo celular quando a
marcação entra na fila offline e viaja no corpo da requisição — é exatamente ele que torna o reenvio
idempotente (Task 15, critério b). Se o servidor pudesse gerar um id por conta própria, um reenvio
viraria uma visita duplicada. O model herda só `TimestampMixin` e declara a PK à mão, caminho que o
docstring do `EntityMixin` (escrito na Task 02) já previa.

**`user_id` com `RESTRICT`, o único FK do schema que não é `CASCADE`.** O `CLAUDE.md` é explícito:
desativar publicador (`is_active = false`) não apaga histórico. `RESTRICT` transforma essa regra em
garantia do banco — um `DELETE` acidental no usuário falha em vez de levar junto o registro de quem
trabalhou onde.

**`Mapped[WKBElement]` nas colunas geométricas.** É o tipo que o GeoAlchemy2 devolve na leitura, e
anotar assim mantém o `Mapped[...]` honesto sem precisar de entrada no `type_annotation_map`. O tipo
concreto vem explícito no `mapped_column`, então a anotação serve só para nullability.

**`geometry`, não `geography`** (decisão herdada da spec, reafirmada aqui): as regras do projeto são
predicados topológicos (`ST_Within`, `ST_Touches`, `ST_Intersects`), que o PostGIS só oferece para
`geometry`. Metros saem de um cast `::geography` pontual na query.

**`passive_deletes=True` junto do `cascade="all, delete-orphan"`.** O `ON DELETE CASCADE` já está no
FK; sem `passive_deletes` a ORM carregaria a coleção inteira e emitiria um `DELETE` por linha antes
de apagar o pai. Com ele, apagar um território vira uma instrução só e o banco resolve a cascata
até os logs.

**Índice `(block_id, worked_at DESC)` via `text("worked_at DESC")`.** Serve as duas leituras quentes
sem índice extra: pegar o log mais recente de uma quadra (recálculo de `last_worked_at`) e listar o
histórico da quadra para o admin.

**`BlockWorkLog.user` é relação de mão única.** `User` não ganhou coleção `work_logs` de propósito —
uma coleção convidaria a configurar cascata de deleção do usuário para o histórico, que é justamente
o que o `RESTRICT` existe para impedir.

**Índice extra em `user_id`.** Não estava na instrução, mas um FK `RESTRICT` sem índice faz o
Postgres varrer a tabela inteira a cada tentativa de apagar/atualizar um usuário. Custo desprezível
no volume do projeto, e evita um lock desagradável.

Nenhuma migration foi escrita — é o escopo da Task 05.

## Como validar

```bash
cd server
uv run ruff check app/models/ && uv run ruff format --check app/models/
uv run python -c "from sqlalchemy.orm import configure_mappers; import app.models; configure_mappers()"
```

Para conferir o DDL contra o PostGIS real, com o banco de desenvolvimento no ar
(`docker compose -f docker-compose.dev.yml up -d`), criar as tabelas num schema descartável e
inspecionar `pg_indexes`. A validação definitiva é a Task 05, com `alembic upgrade head`.

## Resultado da validação

- `ruff check app/models/` — sem erros; `ruff format --check` — 7 arquivos já formatados.
  (`ruff check .` no diretório inteiro acusa um `I001` em `tests/core/test_geo.py`, arquivo da
  Task 07, que rodava em paralelo e está fora do escopo desta task.)
- `configure_mappers()` roda limpo: os `back_populates` fecham em todos os pares
  (`Congregation.territories` ↔ `Territory.congregation`, `Territory.blocks` ↔ `Block.territory`,
  `Block.work_logs` ↔ `BlockWorkLog.block`).
- `BlockWorkLog.__table__.c.id`: `default=None`, `server_default=None`, `primary_key=True` —
  confirmado que a PK vem de fora.
- `Base.metadata.create_all` contra o PostGIS real (schema descartável `t04_probe`, apagado depois)
  criou as cinco tabelas e produziu exatamente os índices esperados:
  - `idx_territories_boundary` e `idx_blocks_polygon` — ambos `USING gist`, uma vez cada
  - `ix_block_work_logs_block_id_worked_at` — `btree (block_id, worked_at DESC)`
  - `uq_territories_congregation_name`, `uq_blocks_territory_number` — unique compostos
  - FKs conferidos no DDL: `territories`/`blocks`/`block_work_logs.block_id` com
    `ON DELETE CASCADE`, `block_work_logs.user_id` com `ON DELETE RESTRICT`
- Projeto ainda sem teste automatizado da camada de models — models não têm comportamento a testar
  (a validação real vem nos services, tasks 13–15, contra PostGIS).
