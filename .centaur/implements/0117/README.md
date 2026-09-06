# [0117] Model `TerritoryAssignment` e migration do histórico de designações (spec 0007, Task 01)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0007/` — Task 01

## Solicitação
Criar `server/app/models/territory_assignment.py` com a classe `TerritoryAssignment(Base,
EntityMixin)` (tabela `territory_assignments`) no estilo de `block_work_log.py`, com
`territory_id` (FK CASCADE), `user_id` (FK RESTRICT), `started_at` e `completed_at` nullable;
relação `assignments` em `Territory`; índice composto `(territory_id, started_at DESC)` e índice
**único parcial** `UNIQUE (territory_id) WHERE completed_at IS NULL`. Registrar no
`models/__init__.py`, gerar a migration e editá-la para também executar
`UPDATE territories SET assigned_user_id = NULL`, com comentários explicando o descarte e o fato
de o `downgrade` não restaurá-lo. Validar o ciclo `upgrade`/`downgrade -1`/`upgrade` contra o
Postgres de desenvolvimento, mais `ruff check`/`ruff format --check`.

## Contexto
A spec 0007 transforma a designação de território num **registro histórico** no estilo do cartão
S-13: cada designação com data de início, encerrada por uma data de conclusão explícita, e
apagável quando foi um erro. Hoje a designação é só a coluna `territories.assigned_user_id`, que
não guarda desde quando nem por quem passou antes. Esta task é a fundação de schema de todas as
outras: sem a tabela não há repositório, service, rota, painel de histórico nem exportação Excel.

`territories.assigned_user_id` continua existindo, mas passa a ser **projeção** da designação
aberta — mesmo papel que `blocks.last_worked_at` tem em relação a `BlockWorkLog`. Por isso a
regra do app (`WorkLogService._refuse_unassigned_territory`) não muda.

## O que foi feito
- Novo model `TerritoryAssignment` (tabela `territory_assignments`), com `EntityMixin` (PK UUID
  gerada em Python + `created_at` do banco), imports sob `TYPE_CHECKING` e docstrings explicando
  o porquê de cada decisão, no estilo de `block_work_log.py`.
- Relação `Territory.assignments` com `cascade="all, delete-orphan"` e `passive_deletes=True`,
  espelhando `Territory.blocks`; `back_populates` no par `territory` do lado novo.
- Registro em `app/models/__init__.py` (import + `__all__`), obrigatório para o autogenerate do
  Alembic enxergar a tabela.
- Migration `d3ab774c1b2f` gerada por autogenerate e editada à mão para acrescentar o
  `op.execute("UPDATE territories SET assigned_user_id = NULL")` e os dois comentários pedidos.

## Arquivos modificados
- `server/app/models/territory.py` — só a relação `assignments` (mais o import de
  `TerritoryAssignment` sob `TYPE_CHECKING`)
- `server/app/models/__init__.py` — import da nova classe e entrada no `__all__`

## Arquivos criados
- `server/app/models/territory_assignment.py` — o model do histórico de designações
- `server/migrations/versions/20260818_0800_d3ab774c1b2f_add_territory_assignments.py` — cria a
  tabela, os índices e zera as designações existentes

## Decisões técnicas
- **`ON DELETE RESTRICT` no `user_id`**, ao contrário do resto do schema: o histórico nomeia uma
  pessoa e não pode perdê-la em silêncio. É exatamente o que `block_work_logs.user_id` já faz.
  Revogar acesso é `is_active = False`, nunca apagar a linha, então isso não bloqueia nada hoje.
- **`ON DELETE CASCADE` no `territory_id`**: apagar o território leva o histórico dele, como já
  leva as quadras — os registros só têm sentido em relação à área que descrevem.
- **Relação com `User` é de mão única** (sem `back_populates`), copiando o que `BlockWorkLog.user`
  já faz: `User` de propósito não tem coleção de designações, para que nada convide a cascatear a
  remoção de um usuário para dentro do histórico. A instrução da task pedia explicitamente para
  não criar relação nova em `User`.
- **Índice único parcial no banco, não só checagem no service**: `UNIQUE (territory_id) WHERE
  completed_at IS NULL` é o que garante o invariante "no máximo uma designação aberta por
  território" mesmo se duas requisições correrem juntas e ambas passarem pela checagem prévia.
- **`text("started_at DESC")` no índice composto**, em vez de `started_at.desc()`: é a forma que
  `block_work_log.py` já usa para o mesmo caso (`text("worked_at DESC")`) e evita referenciar o
  atributo da coluna dentro de `__table_args__`. O resultado no banco é idêntico —
  `btree (territory_id, started_at DESC)`, confirmado no `\d`.
- **`index=True` no `territory_id`** conforme a instrução da task, ainda que o índice composto já
  cubra buscas por essa coluna sozinha. É uma redundância barata neste volume (dezenas de
  territórios); se um dia incomodar, é o índice a remover.
- **Descarte das designações atuais em vez de backfill**: decisão do dono do projeto registrada
  na spec. As designações de hoje não carregam data de início e não há como recuperá-la; inventar
  um `started_at` colocaria data errada dentro do que vai virar o histórico S-13. O admin
  redesigna pela tela, com a data correta.
- **O `downgrade` não restaura as designações zeradas** — os valores não foram guardados em lugar
  nenhum. Está dito em comentário na própria migration, para que ninguém conte com um rollback
  que não existe.

## Como validar
```bash
docker compose -f docker-compose.dev.yml up -d
cd server
uv run alembic upgrade head
uv run alembic downgrade -1
uv run alembic upgrade head
docker exec territory_map_db_dev psql -U territory -d territory_map -c '\d territory_assignments'
uv run ruff check . && uv run ruff format --check .
uv run pytest
```
No `\d` devem aparecer os quatro índices (PK, `territory_id`, `(territory_id, started_at DESC)`,
`user_id`) mais o `uq_territory_assignments_open ... WHERE completed_at IS NULL`, e as duas FKs
com `ON DELETE CASCADE` e `ON DELETE RESTRICT`.

## Resultado da validação
- Ciclo `upgrade head` → `downgrade -1` → `upgrade head` executado contra o PostGIS de
  desenvolvimento: os três passos concluíram sem erro.
- `\d territory_assignments` confere com o pedido: colunas, `created_at` com `now()`, os quatro
  índices esperados e o único parcial `UNIQUE btree (territory_id) WHERE completed_at IS NULL`,
  mais as FKs `CASCADE` (território) e `RESTRICT` (usuário).
- Um `alembic revision --autogenerate` de sondagem gerou `pass` nos dois sentidos e foi apagado em
  seguida — prova de que o model e o schema do banco estão em sincronia, sem diff pendente.
- `uv run ruff check .` → "All checks passed!"; `uv run ruff format --check .` → "87 files already
  formatted".
- `uv run pytest` → **470 passed** (mesmo número de antes; nenhuma regressão).
