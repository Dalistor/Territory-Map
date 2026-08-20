# [0140] WorkLogService: marcação de quadra feita pelo admin

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0009/` — Task 04

## Solicitação
Acrescentar `mark_worked_by_admin(congregation_id, block_id, user_id, worked_at, now=None) -> BlockWorkLog`
a `server/app/services/work_log.py`: gera o `log_id` no servidor (`uuid4`), grava o log pelo
repositório e recalcula `Block.last_worked_at` pelo `_refresh_last_worked_at` existente. O service
passa a receber também o `UserRepository`. Sem checagem de designação, sem limite inferior de 90
dias e sem idempotência por id de cliente — mas com recusa de `worked_at` no futuro e com quadra e
publicador obrigatoriamente da congregação do chamador. Apenas a camada Services (e os testes
dela), mais o ajuste mínimo de construção do service nos routers.

## Contexto
A spec 0009 quer que o admin registre trabalho de campo pela `HomeScreen`, escolhendo o publicador
e a data. As três regras de `mark_worked` existem para defender o servidor de um **celular** —
designação (o app é confinado ao território designado), piso de 90 dias (relógio errado) e
idempotência por `log_id` do cliente (fila offline reenviando). Nenhuma delas descreve o admin, que
digita a data de propósito, sabe o que aconteceu em campo e não tem fila offline. O que sobra é o
que não é sobre o aparelho: data no futuro não existe, e o escopo por congregação é a única
barreira entre inquilinos.

## Critérios de aceite
- Marcar cria um log com o `user_id` pedido e atualiza `last_worked_at` da quadra
- Duas marcações seguidas do mesmo publicador na mesma quadra criam **dois** logs
- Marcar com data mais antiga que o último log **não** faz `last_worked_at` andar para trás
- Quadra de outra congregação e quadra inexistente levantam `NotFoundError`
- Publicador de outra congregação e publicador inexistente levantam `NotFoundError` (o mesmo erro,
  nunca um 403 disfarçado)
- Publicador inativo **pode** ser marcado
- `worked_at` no futuro levanta `InvalidWorkedAtError`; o momento presente é aceito
- `worked_at` de 200 dias atrás é aceito, ao contrário do que `mark_worked` faria
- Marcar numa quadra de território **sem designação aberta** funciona normalmente (e numa designada
  a outra pessoa também)
- Sem `now`, o service lê o relógio injetado — nunca o da máquina

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_the_admin_marking_a_block_records_the_visit_for_the_publisher_they_named` | `server/tests/services/test_work_log_service.py` | `UserRepository` no construtor + `mark_worked_by_admin` com escopo de congregação, recusa de futuro e recomputação da projeção |
| 2 | `test_the_admin_marking_the_same_block_twice_records_two_visits` | idem | fixado pelo `uuid4()` por chamada (mutação F) |
| 3 | `test_the_admin_marking_an_older_visit_does_not_drag_last_worked_at_backwards` | idem | fixado por `_refresh_last_worked_at` (mutação E) |
| 4 | `test_the_admin_marking_a_block_of_another_congregation_is_not_found` | idem | `_block_of_congregation` (mutação D) |
| 5 | `test_the_admin_marking_a_block_that_does_not_exist_is_not_found` | idem | idem |
| 6 | `test_the_admin_naming_a_publisher_of_another_congregation_is_not_found` | idem | `_user_of_congregation` (mutação A) |
| 7 | `test_the_admin_naming_a_publisher_that_does_not_exist_is_not_found` | idem | `_user_of_congregation` (mutação B) |
| 8 | `test_the_admin_can_record_a_visit_for_a_deactivated_publisher` | idem | ausência deliberada de checagem de `is_active` |
| 9 | `test_the_admin_marking_a_visit_in_the_future_is_refused` | idem | `_refuse_future_moment` (mutação C) |
| 10 | `test_the_admin_marking_the_present_moment_is_accepted` | idem | borda do `>` em `_refuse_future_moment` |
| 11 | `test_the_admin_can_record_a_visit_far_older_than_the_app_would_accept` | idem | ausência deliberada do piso de 90 dias (o mesmo teste confirma que `mark_worked` recusa) |
| 12 | `test_the_admin_can_mark_a_block_whose_territory_has_nobody_designated` | idem | ausência deliberada de `_refuse_unassigned_territory` |
| 13 | `test_the_admin_marking_a_block_designated_to_someone_else_is_accepted` | idem | idem |
| 14 | `test_the_admin_marking_without_a_moment_of_its_own_reads_the_injected_clock` | idem | `now_provider` (mutação G) |

**Nota honesta sobre o processo:** o ciclo 1 saiu com a implementação inteira do método, e não com o
mínimo — os treze casos seguintes passaram sem um RED próprio. Em vez de aceitar teste que passa de
primeira, cada guarda foi verificada por **mutação**: quebrar a guarda no código de produção e
confirmar que exatamente o teste correspondente fica vermelho (colunas "mutação A–G" acima). Todas
as sete mutações foram detectadas, e o código de produção foi restaurado após cada uma.

## O que foi feito
- `WorkLogService.__init__` passou a receber `users: UserRepository`, entre `blocks` e `now_provider`.
- Novo método público `mark_worked_by_admin`, com docstring que documenta as três diferenças
  deliberadas em relação a `mark_worked` (sem designação, sem piso de 90 dias, sem idempotência por
  id de cliente) e o que permanece (futuro recusado, escopo por congregação nos dois lados).
- Novo helper privado `_user_of_congregation`, espelhando `_block_of_congregation`: mesmo
  `NotFoundError` para "não existe" e "é de outra congregação", e publicador inativo aceito.
- `_refuse_implausible_moment` foi decomposto: a checagem de futuro virou `_refuse_future_moment`,
  reutilizada pelas duas marcações; o piso de 90 dias ficou só no caminho do app.
- Os dois routers que compõem o service passaram a injetar `UserRepository(session)` — só o
  suficiente para continuar compilando; a rota nova é da Task 05.

## Arquivos modificados
- `server/app/services/work_log.py` — `users` no construtor, `mark_worked_by_admin`,
  `_user_of_congregation`, `_refuse_future_moment` extraído de `_refuse_implausible_moment`
- `server/tests/services/test_work_log_service.py` — `FakeUserRepository`, fixture `users`, `user`
  registrado no fake, e 14 casos novos
- `server/app/routers/admin_blocks.py` — `users=UserRepository(session)` na composição do service
- `server/app/routers/app_client.py` — mesma composição, agora por argumentos nomeados

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`UserRepository` no service, não um `User` já carregado pelo router.** O `mark_worked` do app
  recebe o `User` porque o token já o autenticou; aqui o `user_id` vem do corpo da requisição e é
  entrada não confiável, então quem confere se aquela pessoa é da congregação do chamador é a
  camada que tem a regra — o service —, não o router.
- **`UserRepository.get` + comparação de `congregation_id`, em vez de um
  `get_in_congregation` novo.** A task proíbe tocar em repositories, e a query existente já
  responde o que basta; a decisão de escopo é de negócio e cabe ao service.
- **`_refuse_future_moment` extraído em vez de um parâmetro `allow_old` no helper antigo.** Uma
  flag booleana esconderia no ponto de chamada qual regra vale; dois helpers nomeados deixam a
  diferença entre app e admin legível na própria chamada.
- **Fakes in-memory, sem PostGIS.** Segue o que o arquivo de teste já fazia e explica no cabeçalho:
  nada aqui é geométrico, a quadra é só uma identidade.
- **`is_active` deliberadamente sem teste de recusa** porque não existe recusa: desativar revoga o
  acesso ao app, não apaga a pessoa do histórico que o admin escreve.

## Como validar
```bash
cd server && uv run pytest tests/services/test_work_log_service.py
cd server && uv run pytest -q --cov=app --cov-branch --cov-report=term-missing
cd server && uv run ruff check . && uv run ruff format --check .
```

## Resultado da validação
- `pytest tests/services/test_work_log_service.py` → **41 passando** (27 antes, 14 novos)
- Suíte completa → **535 passando**, 0 falhas
- Cobertura de `app/services/work_log.py`: **100% de linha e 100% de branch** (74 statements, 16
  branches, 0 missing). `app/services/` inteiro em 100%, mantendo o portão de CI
- `ruff check` → All checks passed; `ruff format --check` → 93 files already formatted
