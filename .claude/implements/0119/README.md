# [0119] Service de designação: designar, concluir e apagar o histórico

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0007/` — Task 04

## Solicitação

> Spec 0007 — Task 04: Implemente por TDD. Crie `server/app/services/assignment.py` com
> `AssignmentService`, no estilo de `server/app/services/work_log.py` (construtor recebendo os
> repositórios e um `now_provider: Callable[[], datetime]`; **nunca** chame `datetime.now()`
> direto). Ele recebe `TerritoryAssignmentRepository`, `TerritoryRepository` e `UserRepository`.
> [métodos `designate`, `complete`, `delete`, `list`, com as regras de projeção, escopo por
> congregação e cobertura de 100% linha e branch — instrução completa na Task 04 da spec]

## Contexto

Até aqui a designação de território era **estado**: uma coluna `territories.assigned_user_id`
sobrescrita por `TerritoryService.assign_to_user`. A spec 0007 a transforma em **histórico** — o
cartão S-13 de papel é literalmente uma lista de linhas com data de início e data de conclusão — e
este service é onde essa regra passa a morar.

O model (Task 01, implementação 0117) e o repositório (Task 03, implementação 0118) já existiam;
faltava a camada que decide *o que os dados significam*: quando uma designação aberta é encerrada,
o que acontece com a projeção a cada operação, e quais falhas são indistinguíveis entre si.

A decisão de fundo é a mesma já tomada para `Block.last_worked_at`: `Territory.assigned_user_id`
continua existindo, mas como **projeção** da designação aberta, recalculada e nunca assumida. É o
que faz a regra do app (`WorkLogService._refuse_unassigned_territory`) seguir funcionando sem
mudar uma linha.

## Critérios de aceite

- Designar cria um registro aberto com `started_at` do relógio injetado e aponta
  `territory.assigned_user_id` para o publicador.
- Designar a outro publicador com uma designação aberta encerra a anterior (`completed_at` = agora),
  cria a nova aberta, move a projeção e deixa dois registros no histórico.
- Concluir encerra a aberta e deixa `territory.assigned_user_id` como `None`, mantendo o registro no
  histórico com `completed_at` preenchido.
- Apagar um registro já concluído não mexe na projeção nem no registro aberto.
- Apagar o registro aberto faz `territory.assigned_user_id` voltar a `None`.
- Apagar o registro aberto quando existe um concluído mais antigo **não** reabre o antigo.
- `list` devolve o histórico do mais recente para o mais antigo.
- Território inexistente ou de outra congregação → `NotFoundError` em `designate`, `complete` e
  `list`.
- `user_id` inexistente ou de outra congregação → `NotFoundError` em `designate`.
- `complete` sem designação aberta → `NotFoundError`.
- `delete` com id inexistente ou de outra congregação → `NotFoundError`.
- Publicador desativado (`is_active=False`) pode ser designado normalmente.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_designate_opens_an_assignment_and_points_the_territory_at_the_publisher` | `server/tests/services/test_assignment_service.py` | `AssignmentService.__init__` e `designate` (criar registro aberto + escrever a projeção) |
| 2 | `test_designate_to_someone_else_closes_the_open_assignment_and_keeps_it_in_the_history` | idem | encerramento da designação aberta antes de criar a nova; `list` |
| 3 | `test_complete_closes_the_open_assignment_and_frees_the_territory` | idem | `complete` (fecha a aberta, zera a projeção) |
| 4 | `test_delete_of_a_completed_record_leaves_the_open_assignment_untouched` | idem | `delete` + `_refresh_assigned_user` |
| 5 | `test_delete_of_the_open_record_frees_the_territory` | idem | idem (mesmo recálculo, sem caso especial) |
| 6 | `test_delete_of_the_open_record_does_not_reopen_the_completed_one_before_it` | idem | idem |
| 7 | `test_list_gives_the_history_most_recent_first` | idem | — (já verde: a ordem vem do repositório) |
| 8 | `test_list_of_a_territory_of_another_congregation_is_not_found` | idem | `_territory_of_congregation` |
| 9 | `test_designate_with_a_nonexistent_territory_id_is_not_found` | idem | idem |
| 10 | `test_designate_of_a_territory_of_another_congregation_is_not_found` | idem | idem |
| 11 | `test_designate_with_a_nonexistent_user_id_is_not_found` | idem | `_refuse_stranger_publisher` |
| 12 | `test_designate_with_a_user_of_another_congregation_is_not_found` | idem | idem |
| 13 | `test_designate_accepts_an_inactive_publisher` | idem | — (já verde: `is_active` não é consultado, de propósito) |
| 14 | `test_complete_of_a_territory_of_another_congregation_is_not_found` | idem | `_territory_of_congregation` em `complete` |
| 15 | `test_complete_without_an_open_assignment_is_not_found` | idem | — (já verde no ciclo 3) |
| 16 | `test_delete_with_a_nonexistent_assignment_id_is_not_found` | idem | — (já verde no ciclo 4) |
| 17 | `test_delete_of_an_assignment_of_another_congregation_is_not_found` | idem | — (já verde: o filtro é do `get_in_congregation`) |

Os cinco casos que já nasceram verdes foram mantidos: não são duplicatas de outro teste, e cada um
fixa uma decisão que um refactor futuro poderia desfazer em silêncio — a ordem do histórico, o
direito de designar quem está desativado, e o fato de que os três caminhos de "não encontrado"
respondem igual.

## O que foi feito

Criado `AssignmentService` com quatro métodos públicos e três helpers privados:

- **`designate`** — valida território e publicador (ambos da congregação do token), encerra a
  designação aberta com `completed_at = now` se houver, cria a nova com `started_at = now` e
  aponta a projeção para o novo publicador.
- **`complete`** — encerra a aberta e zera a projeção; sem designação aberta, `NotFoundError`.
- **`delete`** — apaga o registro de vez e recalcula a projeção pelo que sobrou.
- **`list`** — o histórico do território, mais recente primeiro.
- **`_territory_of_congregation`**, **`_refuse_stranger_publisher`**, **`_refresh_assigned_user`**.

## Arquivos criados

- `server/app/services/assignment.py` — a regra de negócio do histórico de designações.
- `server/tests/services/test_assignment_service.py` — 17 testes contra o Postgres real.

## Arquivos modificados

Nenhum. Repositórios, schemas, models e rotas ficaram intocados, como a task pedia.

## Decisões técnicas

- **Teste contra o Postgres real, e não com fakes in-memory como `test_work_log_service.py`.** Nada
  aqui é geométrico, o que à primeira vista pediria fakes — mas duas coisas de que as regras
  dependem só existem no banco: o índice único parcial `uq_territory_assignments_open`, que é o que
  garante uma única designação aberta por território, e
  `TerritoryRepository.set_assigned_user`, que dá `session.refresh` na relação depois do flush. Um
  fake responderia os dois pelo Python e não provaria nada. Isso apareceu de forma concreta no ciclo
  2: o RED foi um `IntegrityError` vindo do índice, ou seja, o teste comprovou o invariante antes de
  a implementação existir.
- **`_refresh_assigned_user` recalcula em vez de assumir**, mesmo padrão de
  `WorkLogService._refresh_last_worked_at`. É o que faz os três casos de `delete` (registro
  concluído, registro aberto, registro aberto com um concluído atrás) saírem certos de uma regra só,
  sem `if` para cada situação — e é por isso que apagar o aberto **não** reabre o anterior.
- **`designate` e `complete` escrevem a projeção direto**, sem passar pelo helper de recálculo.
  Nesses dois caminhos o valor correto é conhecido de antemão (o publicador que acabou de receber,
  ou `None`), e chamar `get_open` de novo seria uma consulta a mais para confirmar o que a linha
  anterior acabou de escrever. O recálculo fica para `delete`, que é o único caso em que o estado
  resultante realmente depende do que sobrou.
- **Território ausente e publicador de outra congregação levantam a mesma `NotFoundError`**, herdado
  do que `TerritoryService.assign_to_user` já fazia. Distinguir os dois transformaria o endpoint num
  oráculo de existência de ids de outras congregações.
- **`is_active` não é consultado em lugar nenhum.** Publicador desativado pode ser designado —
  desativação revoga o acesso ao app, não o vínculo de responsabilidade. O teste 13 é o que impede
  alguém de "consertar" isso adicionando uma checagem.
- **`from __future__ import annotations` no topo**, com comentário: o método `list` sombreia o
  builtin dentro do corpo da classe, exatamente como já acontece em `app/services/territory.py`.
- **`now: datetime | None = None` em `designate` e `complete`**, com o relógio real injetado por
  `now_provider` — `datetime.now()` não é chamado em lugar nenhum. Os testes usam o parâmetro
  explícito para montar históricos com datas distintas, o que também cobre os dois lados do branch.

## Como validar

```bash
cd server
docker compose -f ../docker-compose.dev.yml up -d      # se o Postgres não estiver de pé
uv run pytest tests/services/test_assignment_service.py -q
uv run pytest --cov=app --cov-branch --cov-report=term-missing -q
uv run ruff check . && uv run ruff format --check .
```

## Resultado da validação

- `uv run pytest tests/services/test_assignment_service.py -q` → **17 passed**
- `uv run pytest --cov=app --cov-branch --cov-report=term-missing -q` → **487 passed** (eram 470
  antes desta task), em 60,75s
- Cobertura de `app/services/assignment.py`: **57 statements, 0 missed; 10 branches, 0 partial →
  100% linha e branch**. Todos os módulos de `app/services/` seguem em 100%, o portão que a CI
  exige.
- `uv run ruff check .` → All checks passed! · `uv run ruff format --check .` → 90 files already
  formatted
