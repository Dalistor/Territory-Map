# [0073] Modelo: `Territory.assigned_user_id` e migration

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0005/` — Task 02

## Solicitação

Em `server/app/models/territory.py`, adicionar a coluna `assigned_user_id: Mapped[UUID | None]`,
`ForeignKey("users.id", ondelete="SET NULL")`, `nullable=True`, `index=True`, seguindo o estilo de
`congregation_id` no mesmo arquivo, mas nullable e com `SET NULL` em vez de `CASCADE`. Adicionar a
relação `assigned_user: Mapped["User | None"] = relationship()` com `foreign_keys=[assigned_user_id]`
(import de `User` só sob `TYPE_CHECKING`). Gerar a migration Alembic, conferir que ela cria só a
coluna, o índice e a FK esperados, e rodar `alembic upgrade head` localmente contra o Postgres de
desenvolvimento.

## Contexto

A spec 0005 introduz a designação de território a um publicador: um território tem no máximo um
publicador designado por vez, modelado como uma FK opcional em `territories`. Perder o território
não pode apagar o publicador (daí `assigned_user_id` ser uma FK a partir de `territories`, não o
inverso), e apagar/desativar o publicador não pode ser bloqueado pela designação — só a solta
(`ON DELETE SET NULL`, diferente do `CASCADE` já usado em `congregation_id`). Esta task cobre só o
modelo e a migration; regra de negócio, schemas, repositórios e rotas ficam para as tasks seguintes
da mesma spec.

## O que foi feito

- Adicionada a coluna `assigned_user_id` em `Territory`, com `ForeignKey("users.id",
  ondelete="SET NULL")`, `nullable=True` e `index=True`, com um comentário curto explicando a
  cardinalidade e o porquê de `SET NULL`.
- Adicionada a relação `assigned_user: Mapped["User | None"] = relationship(foreign_keys=[assigned_user_id])`,
  sem `back_populates` — não existe (nem é necessária, por instrução explícita da task) uma relação
  inversa em `User` listando os territórios designados a ele.
- Import de `User` adicionado só sob `TYPE_CHECKING`, no mesmo padrão já usado para `Congregation`
  no arquivo.
- Gerada a migration `server/migrations/versions/20260817_1845_b9a16ff8d0a6_add_territory_assigned_user_id.py`
  via `alembic revision --autogenerate`. O diff gerado continha exatamente o esperado: `add_column`,
  `create_index` e `create_foreign_key` — nada de geometria ou `MULTIPOLYGON` por engano.
- Corrigido manualmente o `downgrade()` gerado: o autogenerate emitiu `op.create_foreign_key(None,
  ...)` / `op.drop_constraint(None, ...)` porque o projeto não define `naming_convention` na
  metadata (nenhuma migration anterior precisou nomear uma FK fora de `create_table`). Substituí o
  `None` pelo nome real que o Postgres atribuiu à constraint (`territories_assigned_user_id_fkey`,
  confirmado com `\d territories`), para que `alembic downgrade` funcione de verdade em vez de
  falhar por falta de nome.

## Arquivos modificados

- `server/app/models/territory.py` — coluna `assigned_user_id`, relação `assigned_user`, import de
  `User` sob `TYPE_CHECKING`.

## Arquivos criados

- `server/migrations/versions/20260817_1845_b9a16ff8d0a6_add_territory_assigned_user_id.py` —
  migration que adiciona a coluna, o índice `ix_territories_assigned_user_id` e a FK
  `territories_assigned_user_id_fkey` (`ON DELETE SET NULL`).

## Decisões técnicas

- **Sem `back_populates` em `assigned_user`**, por instrução explícita da task: nada no escopo desta
  spec precisa listar "os territórios deste publicador" a partir de `User`. Se isso mudar depois, um
  `relationship` inverso pode ser adicionado em `user.py` sem alterar o lado de `Territory`.
- **`ON DELETE SET NULL`, não `CASCADE`**: a designação é uma referência fraca — o território e o
  publicador continuam existindo independentemente um do outro; só o vínculo desaparece.
- **Nome explícito na FK do `downgrade()`**: o projeto não tem `naming_convention` configurada, então
  o autogenerate não conseguiu inferir o nome da constraint para o `drop_constraint` da reversão.
  Como essa é a primeira migration do projeto a alterar uma FK fora de um `create_table` (as
  anteriores sempre definiam a FK dentro da criação da tabela, onde o Postgres nomeia sozinho e o
  Alembic nunca precisa saber o nome depois), não havia precedente a seguir — usei o nome real
  (`territories_assigned_user_id_fkey`) confirmado direto no banco.

## Como validar

```bash
cd server
docker compose -f ../docker-compose.dev.yml up -d   # se o Postgres de dev não estiver de pé
uv run alembic upgrade head
uv run alembic downgrade -1   # confirma que a reversão também funciona
uv run alembic upgrade head
uv run pytest -q
```

## Resultado da validação

- `alembic upgrade head`: aplicou sem erro contra o Postgres de desenvolvimento
  (`territory_map_db_dev`). Conferido com `\d territories` no psql: coluna `assigned_user_id`
  (uuid, nullable), índice `ix_territories_assigned_user_id` e FK
  `territories_assigned_user_id_fkey ... REFERENCES users(id) ON DELETE SET NULL` — exatamente o
  esperado, nada de geometria extra.
- `alembic downgrade -1` seguido de `alembic upgrade head`: ciclo completo sem erro, confirmando que
  o `downgrade()` corrigido funciona de verdade.
- `ruff check .` e `ruff format --check .` (raiz de `server/`): sem erros — `migrations/versions` já
  é excluído do lint pelo `pyproject.toml` (`extend-exclude`), então a migration gerada não precisa
  seguir o estilo de import do resto do projeto.
- `pytest -q`: 458 passed, 2 warnings (warnings pré-existentes, não relacionados a esta mudança).
