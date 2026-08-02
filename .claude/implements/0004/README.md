# [0004] Models Congregation e User

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 03

## Solicitação

> Spec 0001 — Task 03: Crie `server/app/models/congregation.py` e `server/app/models/user.py` com
> SQLAlchemy 2.x (`Mapped`/`mapped_column`), herdando de `Base` e do mixin de `app/models/base.py`.
> `Congregation`: `name: str`, `city: str`, `password_hash: str`, unique composto em `(name, city)`,
> relação `users` e `territories` com `cascade="all, delete-orphan"`. `User`: `congregation_id` FK
> com `ondelete="CASCADE"` e índice, `name: str`, `access_code: str | None` (nullable),
> `access_code_expires_at: datetime | None`, `activated_at: datetime | None`, `token_version: int`
> default 0 e `nullable=False`, `is_active: bool` default `True`. Crie um **índice único parcial** em
> `access_code` com `postgresql_where=access_code IS NOT NULL`. Não escreva migration nesta task.
> Toque apenas em `app/models/`; não altere schemas, repositories, services nem routers.

## Contexto

A Task 02 deixou pronta a `DeclarativeBase` e os mixins (`EntityMixin` com `id` UUID e
`created_at`), mas nenhuma entidade concreta. Esta task mapeia as duas entidades de identidade do
sistema — a congregação (o *tenant* de onde todo dado pende) e o publicador —, que são pré-requisito
da migration inicial (Task 05) e dos repositories de identidade (Task 09).

## O que foi feito

Duas entidades SQLAlchemy 2.x criadas com `Mapped`/`mapped_column`, herdando de `Base` e
`EntityMixin` (que já traz `id: UUID` e `created_at` timezone-aware).

`Congregation` (tabela `congregations`) com `name`, `city` e `password_hash`, unique composto
`uq_congregations_name_city` em `(name, city)`, e as coleções `users` e `territories`, ambas com
`cascade="all, delete-orphan"`.

`User` (tabela `users`) com `congregation_id` (FK `ON DELETE CASCADE`, indexado), `name`,
`access_code`, `access_code_expires_at`, `activated_at`, `token_version` e `is_active`, mais o
índice único parcial `uq_users_access_code` restrito a `access_code IS NOT NULL`.

Os dois módulos foram registrados em `app/models/__init__.py`, sem o qual o autogenerate do Alembic
não enxergaria as tabelas.

Nenhuma migration foi escrita — é escopo da Task 05, como a instrução determina.

## Arquivos modificados

- `server/app/models/__init__.py` — importa e exporta `Congregation` e `User`, para que as tabelas
  fiquem registradas em `Base.metadata` antes do autogenerate

## Arquivos criados

- `server/app/models/congregation.py` — entidade `Congregation`, raiz do grafo multi-tenant
- `server/app/models/user.py` — entidade `User`, o publicador cadastrado pelo admin

## Decisões técnicas

**Índice único parcial em vez de `unique=True` na coluna.** O `access_code` é único globalmente
*enquanto existe*, mas vira `NULL` assim que é resgatado ou expira — e o sistema tende a acumular
muito mais linhas com código nulo do que com código vivo. Um unique comum indexaria todas essas
linhas mortas, e a semântica correta ("dois códigos ativos nunca coincidem") é exatamente o que o
`postgresql_where=access_code IS NOT NULL` expressa.

**`server_default` além do `default` do Python em `token_version` e `is_active`.** O `default` do
SQLAlchemy só age em INSERT feito pelo ORM. Com o `server_default` (`0` e `true`), uma linha inserida
por migration, por script ou à mão nasce igualmente consistente, e a coluna pode ser adicionada a uma
tabela já populada sem passo extra de backfill.

**`passive_deletes=True` nas duas coleções da `Congregation`.** As FKs já carregam
`ON DELETE CASCADE`; sem essa flag o ORM carregaria os filhos em memória e emitiria um `DELETE` por
linha, duplicando o trabalho que o banco faz numa instrução só. O `cascade="all, delete-orphan"`
continua valendo para o caso de remover um item da coleção em Python.

**`created_at` veio do `EntityMixin`, não redeclarado.** As duas entidades têm PK gerada pela
aplicação, então `EntityMixin` serve inteiro. Só o `BlockWorkLog` (Task 04) precisa do
`TimestampMixin` isolado, por ter PK vinda do cliente.

**Tipos de coluna explícitos (`String(120)`, `String(255)`, `String(16)`).** Sem tamanho, o
SQLAlchemy emitiria `VARCHAR` sem limite e a migration ficaria dependente da inferência; fixar aqui
deixa o DDL determinístico para a Task 05. `password_hash` tem 255 para caber o digest bcrypt com
folga, e `access_code` 16 para os 8 caracteres atuais com margem caso o tamanho mude.

**Coordenação com a Task 04 (paralela).** `Congregation.territories` usa
`back_populates="congregation"`, e a Task 04 declarou o lado recíproco em `Territory.congregation` —
verificado depois que os dois arquivos existiam, já que `back_populates` exige o par nos dois
mapeadores. O `app/models/__init__.py` foi editado de forma cirúrgica (não sobrescrito), então as
duas tasks convivem no mesmo arquivo sem perda.

## Como validar

```bash
cd server
uv run ruff check app/models/ && uv run ruff format --check app/models/

# DDL emitido pelos modelos
uv run python -c "
from sqlalchemy.orm import configure_mappers
from sqlalchemy.schema import CreateTable, CreateIndex
from sqlalchemy.dialects import postgresql
import app.models as m
configure_mappers()
pg = postgresql.dialect()
for t in ('congregations', 'users'):
    tbl = m.Base.metadata.tables[t]
    print(CreateTable(tbl).compile(dialect=pg))
    for ix in tbl.indexes:
        print(CreateIndex(ix).compile(dialect=pg))
"
```

A migration correspondente é gerada e conferida na Task 05; nada aqui altera o schema do banco.

## Resultado da validação

- `ruff check app/models/` — All checks passed. `ruff format --check` — 6 files already formatted.
- `configure_mappers()` roda limpo com as cinco entidades registradas (as duas desta task mais as
  três da Task 04), confirmando que os `back_populates` fecham nos dois lados.
- DDL emitido conferido campo a campo: `CONSTRAINT uq_congregations_name_city UNIQUE (name, city)`;
  `FOREIGN KEY(congregation_id) REFERENCES congregations (id) ON DELETE CASCADE`;
  `token_version INTEGER DEFAULT 0 NOT NULL`; `is_active BOOLEAN DEFAULT true NOT NULL`;
  `CREATE UNIQUE INDEX uq_users_access_code ON users (access_code) WHERE access_code IS NOT NULL`;
  `CREATE INDEX ix_users_congregation_id ON users (congregation_id)`.
- Smoke test contra o PostGIS real (`territory_map_test`), inteiro dentro de uma transação com
  rollback ao final — o banco ficou intocado: `create_all` aceito; defaults chegaram como
  `token_version=0`, `is_active=True`, `activated_at=None`; segundo código de acesso vivo idêntico
  rejeitado por `IntegrityError`; três usuários com `access_code` nulo convivendo sem conflito;
  `(name, city)` duplicado rejeitado, mesmo nome em outra cidade aceito; `congregation.users`,
  `user.congregation` e `congregation.territories` navegáveis; apagar a congregação levou os três
  usuários junto (contagem final 0).
- Projeto ainda sem suíte de testes automatizados nesta camada — models não contêm regra de negócio,
  e a cobertura de comportamento entra nos services (Tasks 11–15).
