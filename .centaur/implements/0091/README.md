# [0091] Rota admin: designar território (`PATCH /admin/territories/{territory_id}/assignment`)

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0005/` — Task 08

## Solicitação
Spec 0005 — Task 08: Em `server/app/routers/admin_territories.py`, adicionar
`PATCH /admin/territories/{territory_id}/assignment`, corpo `TerritoryAssignmentIn`, chamando
`territories.assign_to_user(congregation.id, territory_id, payload.user_id)` e devolvendo
`territory_out(territories, territory)`. Atualizar também `territory_out()` para incluir
`assigned_user` no `TerritoryOut` construído, para que as demais rotas do arquivo
(`create_territory`, `list_territories`, `get_territory`, `patch_territory`) passem a devolver a
designação automaticamente. Escopo restrito a `server/app/routers/admin_territories.py`.

## Contexto
Encerra o lado do servidor da funcionalidade de designação de território a um publicador (spec
0005): `TerritoryService.assign_to_user` (Task 05, implementação 0087) e `TerritoryAssignmentIn`/
`TerritoryOut.assigned_user` (Task 03, implementação 0076) já existiam; faltava o endpoint HTTP que
os liga, e o `territory_out()` compartilhado precisava passar a serializar `assigned_user` para que
o admin enxergasse a designação nas telas de listagem e detalhe.

## O que foi feito
- Import de `TerritoryAssignmentIn` (`app.schemas.territory`) e `UserBriefOut`
  (`app.schemas.user`).
- `territory_out()` agora monta `assigned_user=UserBriefOut.model_validate(territory.assigned_user)
  if territory.assigned_user else None` — as quatro rotas existentes que já passam por essa função
  passaram a devolver a designação sem qualquer outra mudança nelas.
- Nova rota `PATCH /admin/territories/{territory_id}/assignment`, corpo `TerritoryAssignmentIn`
  (`user_id: UUID | None`), chamando `territories.assign_to_user(congregation.id, territory_id,
  payload.user_id)` e devolvendo `territory_out(territories, territory)`. `NotFoundError` (404) para
  território ou publicador de outra congregação já vem tratado pelo service (Task 05); nada
  replicado aqui.

## Arquivos modificados
- `server/app/routers/admin_territories.py` — import de `TerritoryAssignmentIn`/`UserBriefOut`,
  `territory_out()` passa a incluir `assigned_user`, nova rota `assign_territory`.

## Decisões técnicas
- A rota fica entre `patch_territory` e `delete_territory`, seguindo a ordem crescente de "risco"
  das operações já presente no arquivo (leitura → escrita branda → escrita destrutiva).
- Nenhum teste foi adicionado neste arquivo: a task restringe o escopo só ao router, e a spec 0005
  já reserva a Task 11 (`tests/integration/`) para cobrir designação e marcação restrita ponta a
  ponta com o servidor real. Os 21 testes existentes de
  `tests/routers/test_admin_territories_routes.py` continuam passando sem alteração, confirmando
  que nada quebrou nas quatro rotas que passam a incluir `assigned_user`.

## Como validar
```bash
cd server
uv run ruff check app/routers/admin_territories.py
uv run ruff format --check app/routers/admin_territories.py
uv run pytest tests/routers/test_admin_territories_routes.py -q
```

## Resultado da validação
- `ruff check` e `ruff format --check`: sem apontamentos.
- `pytest tests/routers/test_admin_territories_routes.py`: 21 passed.
- `pytest` completo do servidor: 4 failed / 6 errors pré-existentes, todos em
  `tests/routers/test_app_client_routes.py` e `tests/integration/`, e confirmados como já
  quebrados **antes** desta mudança (`git stash` isolando só esta edição e rodando
  `test_app_client_routes.py` mostra 12 passed no estado anterior — a quebra vem de outras tasks da
  spec 0005 em andamento em paralelo — Task 06/09/11 —, não desta). Nenhuma falha nova introduzida.
