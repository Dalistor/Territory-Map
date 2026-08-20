# [0165] Rotas: `DELETE /admin/users/{id}` e o DTO montado a partir do nome

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0011/` — Task 04

## Solicitação
Spec 0011 — Task 04. Duas frentes: (1) como a relationship `user` deixou de existir na Task 01,
todo `WorkLogOut.model_validate(log)` e `AssignmentOut.model_validate(assignment)` precisa montar o
campo `user` explicitamente a partir de `user_id` e `user_name`, **sem mudar o formato da resposta**;
(2) acrescentar `DELETE /admin/users/{user_id}` respondendo 204 e mapear
`PublisherHasOpenAssignmentError` para 409 em `app/main.py`.

## Contexto
A Task 01 removeu a FK e a relationship `user` de `BlockWorkLog` e `TerritoryAssignment`, e a Task
02 passou a gravar `user_name` na própria linha. Com isso as leituras de histórico ficaram
quebradas: o Pydantic não tinha mais de onde tirar `WorkLogOut.user`/`AssignmentOut.user` (18 testes
de router vermelhos). A Task 03 criou `UserService.delete` e o erro de domínio, mas sem endereço
HTTP. Esta task fecha as duas pontas na camada Routers.

## Critérios de aceite
- Apagar um publicador responde 204 e ele some de `GET /admin/users`.
- Apagar um que tem registros de trabalho responde 204, e `GET /admin/blocks/{id}/work-logs`
  continua respondendo com o nome dele em `user.name`.
- Apagar um com designação **aberta** responde 409 com `code = "publisher_has_open_assignment"` no
  corpo padrão da API; a designação apenas **concluída** não impede nada.
- Apagar publicador de outra congregação ou id inexistente responde 404.
- A rota não é alcançável sem token de admin, e um token de app não a alcança.
- As leituras de work log e de designação mantêm exatamente o formato anterior, inclusive
  `user.id`.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_the_visit_names_the_publisher_with_the_same_nested_shape_as_before` | `server/tests/routers/test_admin_blocks_routes.py` | `app/routers/history_dto.py` + `with_user` nas duas leituras de `admin_blocks.py` |
| 2 | `test_the_history_keeps_the_name_written_at_the_time_of_the_visit` | `server/tests/routers/test_admin_blocks_routes.py` | idem (o nome vem da linha, não de `users`) |
| 3 | `test_the_stint_names_the_publisher_with_the_same_nested_shape_as_before` | `server/tests/routers/test_admin_assignments_routes.py` | `with_user` nos três pontos de `admin_assignments.py` |
| 4 | `test_the_general_listing_names_the_publisher_the_same_way` | `server/tests/routers/test_admin_assignments_routes.py` | idem, em `AssignmentWithTerritoryOut` |
| 5 | `test_the_card_keeps_the_name_the_publisher_had_when_designated` | `server/tests/routers/test_admin_assignments_routes.py` | idem |
| 6 | `test_the_marking_answers_with_the_publisher_nested_as_id_and_name` | `server/tests/routers/test_app_client_routes.py` | `with_user` em `app_client.py` |
| 7 | `test_deleting_a_publisher_answers_204_and_takes_them_off_the_list` | `server/tests/routers/test_admin_users_routes.py` | `delete_user` em `admin_users.py` |
| 8 | `test_a_publisher_with_recorded_work_can_be_deleted_and_stays_named_in_it` | `server/tests/routers/test_admin_users_routes.py` | idem |
| 9 | `test_deleting_a_publisher_who_still_holds_a_territory_is_409` | `server/tests/routers/test_admin_users_routes.py` | `PublisherHasOpenAssignmentError → 409` em `app/main.py` |
| 10 | `test_a_publisher_whose_stint_was_completed_can_be_deleted` | `server/tests/routers/test_admin_users_routes.py` | idem (só a designação aberta barra) |
| 11 | `test_a_publisher_of_another_congregation_is_404_and_not_403[delete]` | `server/tests/routers/test_admin_users_routes.py` | rota nova sob `current_congregation` |
| 12 | `test_no_route_here_is_reachable_without_an_admin_token[delete]` | `server/tests/routers/test_admin_users_routes.py` | idem |
| 13 | `test_an_app_token_never_reaches_the_deletion_route` | `server/tests/routers/test_admin_users_routes.py` | idem |

## O que foi feito
- Criado `server/app/routers/history_dto.py` com `with_user(row)`: envolve a linha de histórico numa
  view que responde `user` (`UserBriefOut(id=row.user_id, name=row.user_name)`) e repassa todo o
  resto por `__getattr__`. Os seis pontos continuam chamando `model_validate` como antes.
- Os seis pontos passaram a validar `with_user(...)`: `admin_blocks.py` (marcação pelo admin e
  listagem de work logs), `admin_assignments.py` (cartão do território, designar, concluir e a
  listagem geral) e `app_client.py` (marcação pelo app).
- `DELETE /admin/users/{user_id}` em `admin_users.py`, 204, chamando `UserService.delete`.
- `PublisherHasOpenAssignmentError: 409` em `DOMAIN_ERROR_STATUS` (`app/main.py`).
- A fixture `record_work` dos testes de bloco passou a gravar `user_name`, como o service faz.

## Arquivos modificados
- `server/app/routers/admin_blocks.py` — `with_user` nas duas montagens de `WorkLogOut`
- `server/app/routers/admin_assignments.py` — `with_user` nas três montagens de `AssignmentOut`/`AssignmentWithTerritoryOut`
- `server/app/routers/app_client.py` — `with_user` na montagem de `WorkLogOut`
- `server/app/routers/admin_users.py` — rota `delete_user`
- `server/app/main.py` — `PublisherHasOpenAssignmentError` → 409
- `server/tests/routers/test_admin_users_routes.py` — 5 casos novos + `delete` nas duas parametrizações
- `server/tests/routers/test_admin_blocks_routes.py` — 2 casos novos, `user_name` na fixture `record_work`
- `server/tests/routers/test_admin_assignments_routes.py` — 3 casos novos
- `server/tests/routers/test_app_client_routes.py` — 1 caso novo

## Arquivos criados
- `server/app/routers/history_dto.py` — montagem do `user` aninhado a partir da linha de histórico

## Decisões técnicas
- **Wrapper em vez de construção campo a campo.** Escrever `WorkLogOut(id=..., block_id=..., ...)`
  nos seis pontos seria seis chances de esquecer um campo e mudar o formato — exatamente o que a
  task proíbe. O `_RowWithUser` responde só `user` e delega o resto, então o DTO enxerga o que
  enxergava quando a relationship existia, e `AssignmentWithTerritoryOut` continua lendo `territory`
  sem tratamento especial.
- **Módulo próprio dentro de `app/routers/`.** Três routers precisam do helper e nenhum deles é
  dono natural dele; um módulo pequeno na mesma camada não cria camada nova, e importar de um
  router irmão só para pegar um utilitário inverteria a leitura do arquivo.
- **Nada de mexer em `app/schemas/`.** A alternativa seria um validador no próprio `WorkLogOut`,
  mas a task escopa a mudança em Routers, e um DTO que sabe montar-se a partir de um model é
  regra de leitura escondida no contrato.
- **Testes de exclusão criam o passado por HTTP.** Território, quadra, marcação e designação são
  criados pelas próprias rotas do admin, em vez de escritos na sessão: o que se quer provar é que
  a exclusão convive com o que a API produz.
- **RED verificado mesmo nos casos já vermelhos.** Os testes das frentes de DTO em
  `admin_assignments.py` e `app_client.py` foram escritos depois da correção de `admin_blocks.py`;
  para não pular o RED, o arquivo de produção foi guardado com `git stash` e o teste rodado contra
  a versão antiga antes de restaurar.

## Como validar
```bash
cd server && uv run pytest tests/routers -q
cd server && uv run pytest --cov=app --cov-branch --cov-report=term-missing -q
```

## Resultado da validação
- `uv run pytest -q` → **623 passed**, nenhuma falha.
- Cobertura (linha/branch) dos arquivos tocados: `app/routers/admin_users.py` 100%,
  `app/routers/admin_blocks.py` 100%, `app/routers/admin_assignments.py` 100%,
  `app/routers/app_client.py` 100%, `app/routers/history_dto.py` 100%,
  `app/services/` inteiro 100%. `app/main.py` 96% — a única linha descoberta é o bloco de CORS,
  anterior a esta task.
- `uv run ruff check .` e `uv run ruff format --check .` limpos.
