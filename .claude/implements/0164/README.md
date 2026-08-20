# [0164] Apagar publicador, recusando quem tem designação aberta (spec 0011, Task 03)

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0011/` — Task 03

## Solicitação
Spec 0011 — Task 03: implementar por TDD `UserService.delete(congregation_id, user_id)`, com o erro
de domínio `PublisherHasOpenAssignmentError`, o método de repositório que responde se um publicador
tem designação aberta, e a injeção desse repositório no `UserService` (ajustando as composições só o
suficiente para continuarem compilando). Apenas Repositories, Services e `core/exceptions.py`.

## Contexto
As Tasks 01 e 02 derrubaram as FKs de `block_work_logs.user_id` e `territory_assignments.user_id` e
passaram a gravar `user_name` na própria linha. Com isso, apagar um publicador deixou de ser
impossível — o banco não recusa mais quem já trabalhou uma quadra. Faltava a regra de negócio: existe
uma única barreira, e ela é sobre o presente, não sobre o passado.

## Critérios de aceite
- Apagar um publicador recém-cadastrado o remove da lista.
- Apagar um publicador que tem registros de trabalho **funciona**, e os registros continuam
  existindo, ainda nomeando a pessoa.
- Apagar um publicador com designações apenas **concluídas** funciona, e o cartão S-13 permanece.
- Apagar um publicador com designação **aberta** levanta `PublisherHasOpenAssignmentError`, e a
  pessoa continua na lista.
- Publicador de outra congregação e id inexistente levantam o mesmo `NotFoundError` (404, nunca 403).
- Apagar um publicador **não** apaga território nenhum: o território segue de pé e só perde a
  designação obsoleta (`assigned_user_id` vira `NULL`).

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `deleting_a_freshly_registered_publisher_takes_them_off_the_list` | `server/tests/services/test_user_service.py` | `UserService.delete` + `UserRepository.delete` |
| 2 | `deleting_a_publisher_who_has_worked_blocks_still_removes_them` e `the_work_logs_of_a_deleted_publisher_survive_still_naming_them` | idem | nada novo — guarda de regressão da fundação da Task 01 (com a FK antiga, o `delete` estouraria `IntegrityError`) |
| 3 | `deleting_a_publisher_whose_assignments_are_all_completed_removes_them` | idem | idem |
| 4 | `deleting_a_publisher_who_still_holds_a_territory_is_refused` | idem | `PublisherHasOpenAssignmentError`, `TerritoryAssignmentRepository.has_open_for_user`, injeção do repositório no `UserService` |
| 5 | `deleting_a_publisher_of_another_congregation_raises_not_found` | idem | nada novo — `_get_of_congregation` já respondia |
| 6 | `deleting_a_publisher_who_does_not_exist_raises_the_same_not_found` | idem | idem |
| 7 | `deleting_a_publisher_leaves_their_former_territory_standing` | idem | nada novo — `ON DELETE SET NULL` em `territories.assigned_user_id` |

Os ciclos 2, 3, 5, 6 e 7 passaram na primeira execução, e isso está registrado de propósito: eles
não descrevem código novo, descrevem garantias que o schema e o `_get_of_congregation` já davam e
que a exclusão não pode perder depois. São guardas de regressão significativas — sem a queda das FKs
da Task 01, os ciclos 2 e 3 falhariam com `IntegrityError`; sem o `SET NULL`, o 7 também.

## O que foi feito
- `PublisherHasOpenAssignmentError` (`code = "publisher_has_open_assignment"`), com mensagem que diz
  ao admin **o que fazer**: concluir a designação na página Designações e só então apagar.
- `TerritoryAssignmentRepository.has_open_for_user(user_id)`, respondido em SQL (um `SELECT id ...
  LIMIT`), sem carregar histórico nenhum.
- `UserRepository.delete(user)`, com a documentação do que **não** vai junto.
- `UserService.delete(congregation_id, user_id)`: resolve o publicador no escopo da congregação,
  recusa se houver designação aberta, apaga o resto. A docstring registra explicitamente que ter
  histórico não é motivo de recusa — é o oposto do modelo anterior — e a diferença entre apagar e
  desativar.
- O `TerritoryAssignmentRepository` passou a ser dependência de construtor do `UserService`
  (segundo parâmetro posicional), e as duas composições existentes foram ajustadas.

## Arquivos modificados
- `server/app/core/exceptions.py` — nova exceção de domínio `PublisherHasOpenAssignmentError`
- `server/app/repositories/territory_assignment.py` — `has_open_for_user`
- `server/app/repositories/user.py` — `delete`
- `server/app/services/user.py` — `delete` e a injeção do repositório de designações
- `server/app/routers/auth.py` — `get_user_service` monta o service com o novo repositório
- `server/app/jobs/expire_codes.py` — mesma composição, no job
- `server/tests/services/test_user_service.py` — sete casos novos, `FakeAssignmentRepository` e as
  fixtures de banco real (`db_service`, `make_territory`, `make_block`)

## Arquivos criados
Nenhum.

## Decisões técnicas
- **A barreira é sobre o presente, não sobre o passado.** Designação aberta significa território
  sendo trabalhado agora; concluí-la em nome do admin gravaria uma data de conclusão que ninguém
  informou. Histórico (trabalho, designações fechadas) não segura ninguém — é exatamente para isso
  que o nome passou a viver na linha.
- **Os testes de `delete` rodam contra o PostGIS real**, ao contrário do resto do arquivo, que usa
  fakes in-memory. O que a exclusão precisa provar é o que ela *não* leva junto — os work logs, as
  designações concluídas, o território —, e essas três garantias moram no schema (uma FK que deixou
  de existir, um `SET NULL`), não em Python. Um fake responderia tudo a partir de uma lista e não
  provaria nada.
- **`assignments` é o segundo parâmetro posicional do construtor**, ao lado de `users`: são as duas
  fontes de dados do service, e `now_provider` continua sendo o terceiro. As chamadas afetadas eram
  duas, ambas composition roots.
- **`FakeAssignmentRepository` implementa só `has_open_for_user`**, o único método que o service usa
  — mesma linha do `FakeUserRepository` que já existia, que também não é o repositório inteiro.
- **A fiação HTTP não foi tocada**, como manda a task: `DELETE /admin/users/{id}` e o mapeamento do
  erro para 409 são da Task 04.

## Como validar
```bash
cd server && uv run pytest tests/services/test_user_service.py -q
cd server && uv run pytest tests/services --cov=app/services --cov-branch --cov-report=term-missing -q
```

## Resultado da validação
- `uv run pytest tests/services/test_user_service.py -q` → **48 passed**.
- Cobertura de `app/services/user.py`: **100% de linha e 100% de branch** (70 stmts, 16 branches, 0
  misses). O portão de 100% em `app/services/` continua fechado para todos os módulos exercitados
  por esta suíte.
- `uv run ruff check .` → All checks passed. `uv run ruff format --check .` → 95 files already
  formatted.
- Suíte inteira: **579 passed, 25 failed, 6 errors**. Todas as falhas são as já anunciadas na spec —
  testes de router e de integração que ainda montam `BlockWorkLog` sem `user_name` ou leem a
  relationship `user` que a Task 01 removeu (`test_admin_blocks_routes`, `test_admin_assignments_routes`,
  `test_app_client_routes` e os arquivos de `tests/integration/`). São o escopo da Task 04. Nenhuma
  delas envolve `UserService`: `tests/routers/test_admin_users_routes.py` passa 15/15 e
  `tests/services/` passa inteiro.
