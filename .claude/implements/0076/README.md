# [0076] Schemas: designação de território e território trabalhado

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0005/` — Task 03

## Solicitação

Em `server/app/schemas/territory.py`, adicionar o campo `assigned_user: UserBriefOut | None = None`
em `TerritoryOut` (mesmo padrão de `WorkLogOut.user`), e a nova classe
`TerritoryAssignmentIn(BaseModel): user_id: UUID | None` sem valor default. Em
`server/app/schemas/work_log.py`, adicionar a classe `WorkedTerritoryOut(OutSchema)` com `id`,
`name` e `last_worked_at` (nunca nulo). Tocar apenas esses dois arquivos de `server/app/schemas/`.

## Contexto

Task 03 da spec 0005 (app do publicador em React Native, com designação de território). Depende da
Task 02 (já concluída em `implements/0073`), que criou `Territory.assigned_user_id` no modelo. Esta
task só cria os DTOs; a Task 04 (repositórios) e a Task 05/07 (services) vêm depois, consumindo
esses schemas.

## O que foi feito

- `TerritoryOut` ganhou o campo `assigned_user: UserBriefOut | None = None`, importando
  `UserBriefOut` de `app.schemas.user` — mesmo padrão de `WorkLogOut.user` em
  `server/app/schemas/work_log.py`: nested em vez de nome solto, para o cliente distinguir duas
  pessoas com o mesmo nome.
- Nova classe `TerritoryAssignmentIn(BaseModel)` com `user_id: UUID | None`, **sem** valor default —
  mesmo raciocínio de `UserPatchIn.is_active`: o endpoint existe para setar o estado (designar ou
  remover a designação), e um corpo sem o campo não significa nada.
- Nova classe `WorkedTerritoryOut(OutSchema)` em `work_log.py`, com `id: UUID` (o id do território),
  `name: str` e `last_worked_at: datetime` — nunca nulo, porque esse schema só serve para
  territórios com pelo menos uma marcação do publicador (quem decide isso é a query da Task 04, não
  este DTO).

## Arquivos modificados

- `server/app/schemas/territory.py` — import de `UserBriefOut`; campo `assigned_user` em
  `TerritoryOut`; classe nova `TerritoryAssignmentIn`.
- `server/app/schemas/work_log.py` — classe nova `WorkedTerritoryOut`.
- `server/tests/schemas/test_territory_schemas.py` — um teste existente
  (`test_territory_out_carries_the_boundary_and_the_blocks_inside_it`) comparava o conjunto exato de
  chaves de `TerritoryOut.model_dump()`; ajustado para incluir `"assigned_user"`, já que o novo campo
  altera legitimamente essa forma. Nenhum outro arquivo fora do escopo foi tocado.

## Decisões técnicas

- Nenhuma dúvida real bloqueava a implementação: a instrução da task já especificava tipo, default
  (ou ausência dele) e o padrão exato a seguir (`WorkLogOut.user`, `UserPatchIn.is_active`).
- O ajuste no teste existente não é uma violação do "toque apenas esses dois arquivos de
  `server/app/schemas/`" — a restrição é sobre não mexer em repositórios, serviços ou rotas; manter
  a suíte de testes verde depois de uma mudança de schema legítima é parte de "aplicar a mudança"
  corretamente, não uma camada adicional.
- Confirmado que não há import circular: `territory.py` já importava `block.py`, e agora também
  `user.py`; `user.py` importa apenas `auth.py` (para `CongregationOut`) e `app.core.security`, sem
  voltar a apontar para `territory.py`.

## Como validar

```bash
cd server
uv run pytest tests/schemas/test_territory_schemas.py tests/schemas/test_work_log_schemas.py -q
uv run ruff check app/schemas/territory.py app/schemas/work_log.py
uv run ruff format --check app/schemas/territory.py app/schemas/work_log.py
```

## Resultado da validação

- `uv run python -c "import app.schemas.territory; import app.schemas.work_log"` — sem erro,
  confirma ausência de import circular.
- `pytest tests/schemas/` — 94 passed.
- `pytest -q -x --ignore=tests/integration` (suíte inteira, exceto integração que exige Postgres
  real) — 433 passed, sem regressão em repositórios, serviços ou rotas que constroem `TerritoryOut`.
- `ruff check .` — All checks passed.
- `ruff format --check .` — 84 files already formatted.
