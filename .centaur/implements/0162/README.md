# [0162] O nome na linha do histórico: modelos e migration (spec 0011, Task 01)

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0011/` — Task 01

## Solicitação
Acrescentar `user_name` (`String(120)`, `NOT NULL`) a `BlockWorkLog` e `TerritoryAssignment`,
remover o `ForeignKey` de `user_id` (deixando um UUID comum) e remover a relationship `user` dos
dois modelos, documentando em inglês o porquê. Gerar a migration que adiciona a coluna como
nullable, preenche a partir de `users` enquanto a FK ainda existe, torna `NOT NULL` e derruba as
duas chaves estrangeiras; no downgrade, recria as FKs e remove as colunas. Rodar
`alembic upgrade head` e `alembic check`. Tocar apenas Models e Migrations.

## Contexto
O objetivo da spec 0011 é permitir que o admin **apague** um publicador sem perder o histórico.
Hoje isso é impossível: `block_work_logs.user_id` e `territory_assignments.user_id` são
`ON DELETE RESTRICT`, e o banco recusa a exclusão de quem já trabalhou uma quadra ou já apareceu
num cartão S-13. Esta task troca a fundação: a linha passa a guardar o **nome copiado no momento
da escrita** em vez de apontar para a pessoa.

## O que foi feito
- `BlockWorkLog` e `TerritoryAssignment` ganharam `user_name: Mapped[str]` (`String(120)`, mesmo
  tamanho de `User.name`, `nullable=False`).
- `user_id` perdeu o `ForeignKey("users.id", ondelete="RESTRICT")` nos dois modelos e continua
  `PgUUID(as_uuid=True)`, `nullable=False`, com índice.
- As relationships `BlockWorkLog.user` e `TerritoryAssignment.user` foram removidas, junto com os
  imports `from app.models.user import User` que ficaram órfãos sob `TYPE_CHECKING`. `ForeignKey` e
  `relationship` continuam importados nos dois arquivos porque `block_id`/`territory_id` ainda os
  usam; `String` passou a ser importado.
- Comentários em inglês nos dois arquivos explicam: por que não há mais FK (o registro precisa
  sobreviver à exclusão do publicador), o que `user_id` passou a ser (id sem constraint, útil para
  agrupar enquanto a pessoa existe, órfão e inofensivo depois), a consequência aceita (o nome é uma
  fotografia — renomear o publicador não reescreve o histórico) e por que a relationship não pode
  voltar (resolveria para `None` justamente no caso que a spec existe para resolver).
- Migration `e7b34c1d5a80`, com `down_revision = 'c5e21f0a7d94'` (head confirmada com
  `uv run alembic heads`).

## Arquivos modificados
- `server/app/models/block_work_log.py` — `user_name` adicionada, FK e relationship `user` removidas, documentação em inglês
- `server/app/models/territory_assignment.py` — mesma mudança, com a documentação espelhada

## Arquivos criados
- `server/migrations/versions/20260820_1000_e7b34c1d5a80_add_history_user_name.py` — adiciona `user_name` nullable nas duas tabelas, preenche com `UPDATE ... FROM users`, tranca em `NOT NULL` e derruba `block_work_logs_user_id_fkey` e `territory_assignments_user_id_fkey`; o downgrade recria as duas FKs e remove as colunas

## Decisões técnicas
- **A ordem da migration é o ponto todo.** Coluna nullable → backfill → `NOT NULL` → drop das FKs.
  Preencher enquanto o `RESTRICT` ainda vale é o que garante que toda linha encontra o seu usuário:
  não existe linha órfã por construção, então o backfill é exato e não há caso a tratar (o projeto
  também não está em produção, como registrado na spec).
- **Nomes das constraints confirmados no banco**, não deduzidos: as FKs nasceram sem nome explícito
  em `81019c0977bf` e `d3ab774c1b2f`, e o Postgres as chamou de `block_work_logs_user_id_fkey` e
  `territory_assignments_user_id_fkey` — verificado por consulta a `pg_constraint` antes de escrever
  o `drop_constraint`.
- **`user_name` é `NOT NULL`** pela mesma razão que `user_id` sempre foi: um registro sem autor não
  serviria para nada. Não há `server_default` — o valor certo vem do backfill, não de um literal.
- **Sem relationship de substituição.** Sem FK, um join não é mais garantido pelo banco; quem lê
  monta o autor a partir de `user_id` + `user_name`, que estão sempre lá (é a Task 04).
- **O downgrade pode falhar de propósito, e isso está documentado no docstring dele**: recriar a FK
  é impossível se algum publicador tiver sido apagado no intervalo — exatamente a situação que esta
  migration existe para permitir. Voltar só é possível enquanto todo `user_id` ainda nomear uma
  linha viva.

## Como validar
```bash
cd server
uv run alembic upgrade head
uv run alembic check
uv run alembic downgrade -1 && uv run alembic upgrade head   # ida e volta
uv run ruff check . && uv run ruff format --check .
```

## Resultado da validação
- `uv run alembic heads` → `c5e21f0a7d94 (head)` antes da migration; depois, `e7b34c1d5a80`.
- `uv run alembic upgrade head` aplicou sem erro; `uv run alembic check` respondeu
  **"No new upgrade operations detected"** — os modelos e o schema batem.
- Ida e volta (`downgrade -1` + `upgrade head`) executou limpo.
- `ruff check` → *All checks passed*; `ruff format --check` → *95 files already formatted*.
- `pytest` → **44 falhas e 6 erros, 546 passando** — todas esperadas e pertencentes às Tasks 02, 03
  e 04, conforme avisado na própria instrução da task. Nada fora de Models/Migrations foi corrigido.
  As duas causas foram confirmadas rodando dois casos isolados:
  - `AttributeError: type object 'TerritoryAssignment' has no attribute 'user'` — a relationship
    removida, ainda usada em `app/repositories/territory_assignment.py:66` (Task 04);
  - `NotNullViolation: null value in column "user_name"` — os repositórios ainda não gravam o nome
    (Task 02).

  Arquivos afetados: `tests/services/test_assignment_service.py` (16 casos),
  `tests/routers/test_admin_assignments_routes.py` (10), `tests/routers/test_admin_blocks_routes.py`
  (8), `tests/routers/test_app_client_routes.py` (3), e em integração
  `test_admin_marking_integration.py`, `test_assignment_history_integration.py` (2),
  `test_block_status_override_integration.py`, `test_device_swap_integration.py`,
  `test_full_flow_integration.py`, `test_territory_assignment_integration.py`, mais os 6 erros de
  setup em `test_revocation_integration.py`. `tests/services/test_work_log_service.py` continua
  passando, porque usa fake de repositório em vez do banco.
