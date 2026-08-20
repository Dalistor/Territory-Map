# [0163] O nome do publicador gravado junto com o registro (spec 0011, Task 02)

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0011/` — Task 02

## Solicitação

> Spec 0011 — Task 02: implemente por TDD em `server/app/repositories/block_work_log.py`,
> `server/app/repositories/territory_assignment.py`, `server/app/services/work_log.py` e
> `server/app/services/assignment.py`, com os testes em
> `server/tests/services/test_work_log_service.py` e
> `server/tests/services/test_assignment_service.py`. Os dois métodos `create` dos repositórios
> passam a receber e gravar `user_name`. Nos services, o nome sai do `User` que eles já têm em
> mãos. Toque apenas nas camadas Repositories e Services (e nos testes de service).

## Contexto

A Task 01 acrescentou `user_name` a `block_work_logs` e a `territory_assignments`, derrubou as FKs
para `users` e removeu as relationships `user` dos dois modelos. A coluna existe e é `NOT NULL`,
mas ninguém a preenche: toda escrita nova quebraria, e o histórico só sobrevive à exclusão do
publicador se o nome for copiado no momento em que a linha nasce. Esta task fecha esse buraco na
camada que escreve.

## Critérios de aceite

1. Marcar uma quadra pelo app grava o nome do publicador na linha.
2. Marcar pelo admin grava o nome do publicador **escolhido**, não o de quem está designado.
3. Designar um território grava o nome do dirigente.
4. O nome gravado é o que a pessoa tinha **no momento da escrita** — renomear depois não altera as
   linhas já criadas.
5. Um reenvio de `log_id` já conhecido devolve o registro existente sem criar outro nem reescrever
   o nome.
6. As regras que já existiam (designação exigida na rota do app, escopo de congregação, recusa de
   data implausível) continuam valendo sem alteração.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_marking_a_block_stores_the_publishers_name_on_the_row` | `tests/services/test_work_log_service.py` | `BlockWorkLogRepository.create(..., user_name)`; `WorkLogService.mark_worked` passa `user.name`; fake atualizado para a interface nova |
| 2 | `test_the_admin_marking_a_block_stores_the_name_of_the_publisher_they_chose` | `tests/services/test_work_log_service.py` | `mark_worked_by_admin` passa `publisher.name`, o publicador que ele já resolvia por `_user_of_congregation` |
| 3 | `test_renaming_the_publisher_afterwards_does_not_rewrite_the_rows_already_stored` | `tests/services/test_work_log_service.py` | — guarda de regressão (verde de primeira, ver Decisões técnicas) |
| 4 | `test_resending_a_known_log_id_neither_duplicates_the_row_nor_rewrites_its_name` | `tests/services/test_work_log_service.py` | — guarda de regressão, validada por mutação |
| 5 | `test_designate_stores_the_publishers_name_on_the_assignment` | `tests/services/test_assignment_service.py` | `TerritoryAssignmentRepository.create(..., user_name)`; `_refuse_stranger_publisher` virou `_publisher_of_congregation`, que devolve o `User`; remoção dos `joinedload(TerritoryAssignment.user)` |
| 6 | `test_renaming_the_publisher_afterwards_does_not_rewrite_the_assignments_already_opened` | `tests/services/test_assignment_service.py` | — guarda de regressão sobre o banco real |

## O que foi feito

- **`repositories/block_work_log.py`** — `create` recebe `user_name` e o grava na linha.
- **`repositories/territory_assignment.py`** — `create` recebe `user_name`; os quatro
  `joinedload(TerritoryAssignment.user)` foram removidos, porque a relationship deixou de existir
  na Task 01 e o eager load quebrava toda leitura de designação. A docstring da classe explica o
  que substituiu o join: `user_id` + `user_name` na própria linha.
- **`services/work_log.py`** — `mark_worked` grava `user.name` (o `user` já chegava inteiro por
  parâmetro) e `mark_worked_by_admin` grava `publisher.name`, o publicador que
  `_user_of_congregation` já resolvia. Nenhuma consulta nova.
- **`services/assignment.py`** — `_refuse_stranger_publisher` virou `_publisher_of_congregation`:
  a validação já carregava a pessoa, então passou a devolvê-la em vez de descartá-la, e `designate`
  grava `publisher.name`. Mesma checagem, mesmo `NotFoundError`, zero consulta a mais.
- **Fakes dos testes** — `FakeBlockWorkLogRepository.create` acompanha a assinatura real, para que
  o fake continue provando o que promete.

## Arquivos modificados

- `server/app/repositories/block_work_log.py` — `create` recebe e grava `user_name`
- `server/app/repositories/territory_assignment.py` — `create` recebe e grava `user_name`; fim dos
  `joinedload` da relationship removida
- `server/app/services/work_log.py` — o nome do publicador nas duas rotas de marcação
- `server/app/services/assignment.py` — o nome do dirigente na designação; `_publisher_of_congregation`
- `server/tests/services/test_work_log_service.py` — fake atualizado + 4 casos
- `server/tests/services/test_assignment_service.py` — 2 casos

## Decisões técnicas

- **O nome vem do `User` que o service já tem, nunca de uma consulta nova.** Os três pontos de
  escrita já haviam carregado a pessoa por outra razão (parâmetro, escopo de congregação,
  validação de designação). Uma consulta a mais só criaria uma janela em que o nome gravado
  poderia divergir do que a regra acabou de validar.
- **`_refuse_stranger_publisher` → `_publisher_of_congregation`.** Um método que valida e joga
  fora o objeto obriga o chamador a buscá-lo de novo. Devolver o `User` mantém a checagem idêntica
  (mesmo `NotFoundError` indistinguível entre "não existe" e "é de outra congregação") e elimina a
  segunda busca. O nome novo espelha `_user_of_congregation` e `_territory_of_congregation`, que já
  existiam com esse contrato.
- **Os `joinedload` da relationship `user` foram removidos aqui, e não deixados para a Task 04.**
  Eles vivem na camada Repositories, que é escopo desta task, e sem removê-los nenhum teste de
  designação sequer executava — o arquivo inteiro morria em `AttributeError`.
- **Os ciclos 3, 4 e 6 ficaram verdes de primeira, e foram mantidos.** O comportamento que eles
  descrevem (o nome é uma fotografia; o reenvio não reescreve nada) emerge do desenho — copiar uma
  `str` e retornar cedo no reenvio — em vez de ser implementado. São critérios de aceite explícitos
  da spec, então valem como guarda contra a regressão óbvia: alguém "corrigir" o histórico
  reescrevendo o nome na leitura ou no reenvio. Para não deixá-los como asserção vazia, o ciclo 4
  foi verificado por mutação — inserir `stored.user_name = user.name` antes do `return` do reenvio
  faz o teste falhar, e o teste foi mantido só depois disso.
- **Nada de mock de banco no lado da designação.** O suite de assignment já roda contra o PostGIS
  real (o índice único parcial e o refresh de `set_assigned_user` são do banco), e o teste de
  renomeação usa `session.flush()` para provar que a linha não muda nem depois do flush.

## Como validar

```bash
cd server
uv run pytest tests/services/test_work_log_service.py tests/services/test_assignment_service.py
uv run pytest tests/services -q --cov=app/services --cov-branch --cov-report=term-missing
uv run ruff check . && uv run ruff format --check .
```

## Resultado da validação

- `uv run pytest tests/services` → **193 passando**, 0 falhando.
- Cobertura de `app/services/` na suíte inteira, com branch: `assignment.py` **100% linha / 100%
  branch**, `work_log.py` **99% linha / 100% branch** — a única linha descoberta é
  `list_worked_territories` (linha 148), que **não foi tocada por esta task** e é exercida por
  `tests/integration/test_territory_assignment_integration.py`, hoje falhando antes de chegar lá
  porque `WorkLogOut.model_validate` ainda depende da relationship removida na Task 01. O portão
  de 100% volta a fechar com a **Task 04**, que é quem monta o DTO a partir de `user_id` +
  `user_name`.
- `ruff check` e `ruff format --check` limpos.
- Suíte completa: 571 passando, 25 falhando + 6 erros — **todos** em `tests/routers/` e
  `tests/integration/`, todos com o mesmo `ValidationError: 1 validation error for
  AssignmentOut/WorkLogOut ... user Field required`. É exatamente o vermelho transitório previsto
  na spec ("a árvore fica transitoriamente vermelha até a Task 04 fechar") e nenhum deles é de
  Repositories ou Services.
