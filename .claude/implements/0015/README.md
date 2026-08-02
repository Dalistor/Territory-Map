# [0015] Service de registro de trabalho

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 15

## Solicitação

> Spec 0001 — Task 15: Implemente por TDD `server/app/services/work_log.py` com
> `WorkLogService` (recebe `BlockWorkLogRepository`, `BlockRepository`, `now_provider`).
> Métodos: `mark_worked(log_id, block_id, user, worked_at, now)`,
> `list_by_block(congregation_id, block_id)`, `delete(congregation_id, log_id)`.
> Critérios de aceite: (a) marcar uma quadra cria o log e atualiza `Block.last_worked_at`
> para o `worked_at` informado; (b) reenviar o **mesmo `log_id`** não cria registro novo e
> não altera nada — devolve o log existente e sinaliza que já existia (idempotência do
> reenvio offline); (c) duas marcações da mesma pessoa no mesmo bloco com `log_id`
> diferentes criam **dois** registros; (d) marcar com um `worked_at` **anterior** ao
> `last_worked_at` atual cria o log mas **não** rebaixa `last_worked_at` — ele é sempre o
> máximo; (e) `worked_at` no futuro em relação ao `now` injetado levanta
> `InvalidWorkedAtError`; (f) `worked_at` mais de 90 dias antes do `now` levanta
> `InvalidWorkedAtError`; (g) marcar quadra de outra congregação levanta `NotFoundError`;
> (h) apagar um log recalcula `last_worked_at` a partir do log remanescente mais recente;
> (i) apagar o **último** log de uma quadra devolve `last_worked_at` para `None`; (j) o
> histórico de um usuário desativado continua listável. Toque apenas em
> `app/services/work_log.py` e `tests/services/test_work_log_service.py`.

## Contexto

Marcar quadra é a **única** escrita que o app Android faz, e ela chega nas piores
condições do sistema: de um celular sem sinal, cuja fila é enviada depois, possivelmente
mais de uma vez, com um relógio que ninguém controla.

O `CLAUDE.md` já decidia o desenho que resolve isso — trabalho é log, não estado, e
`Block.last_worked_at` é projeção derivada do `BlockWorkLog` mais recente. Faltava a
camada que faz essas decisões valerem: reconhecer o reenvio pelo `log_id` do cliente,
recusar um relógio implausível e recalcular a projeção a cada inserção e remoção.

## Critérios de aceite

Os dez da task, mais três derivados durante a análise:

| # | Comportamento |
|---|---------------|
| a | Marcar cria o log e leva `Block.last_worked_at` ao `worked_at` informado |
| b | Reenviar o mesmo `log_id` devolve o log existente, sinaliza `created=False` e não altera nada — nem o `worked_at` gravado, nem o `last_worked_at` |
| c | Dois `log_id` diferentes da mesma pessoa no mesmo bloco criam dois registros |
| d | Marcação anterior ao `last_worked_at` é gravada sem rebaixá-lo; marcação posterior o avança |
| e | `worked_at` no futuro em relação ao `now` injetado → `InvalidWorkedAtError`; exatamente no `now` é aceito |
| f | `worked_at` com mais de 90 dias → `InvalidWorkedAtError`; exatamente 90 dias é aceito |
| g | Marcar quadra de outra congregação → `NotFoundError`, sem criar log nem tocar na quadra |
| h | Apagar um log recalcula `last_worked_at` a partir do remanescente mais recente |
| i | Apagar o último log devolve `last_worked_at` para `None` |
| j | O histórico de um publicador desativado continua listável, com o nome dele |
| k | *(derivado)* Um reenvio é confirmado mesmo depois que a visita ficou velha demais para ser aceita como nova |
| l | *(derivado)* Um `log_id` já gasto em **outra** quadra é recusado, nunca confirmado |
| m | *(derivado)* `list_by_block` e `delete` de recurso de outra congregação → `NotFoundError`; log inexistente → `NotFoundError` |

## Ciclos TDD

Todos em `tests/services/test_work_log_service.py`.

| # | Caso de teste | Código que passou a existir |
|---|---------------|------------------------------|
| 1 | `marking_a_block_records_the_visit_as_a_new_log` | `WorkLogService` e `mark_worked`, criando o log com o id do cliente |
| 2 | `marking_a_block_moves_its_last_worked_at_to_the_reported_moment` | resolução do bloco e escrita de `last_worked_at` |
| 3 | `resending_the_same_log_id_returns_the_stored_log_without_recording_a_visit` | curto-circuito de idempotência devolvendo `(log, False)` |
| 4 | `resending_a_log_id_with_a_different_moment_does_not_rewrite_the_stored_visit` | — (verde de primeira: garantido pelo ciclo 3; mantido como regressão contra um "upsert") |
| 5 | `the_same_publisher_working_the_block_twice_records_two_visits` | — (verde de primeira: append-only já vinha do ciclo 1) |
| 6 | `a_marking_older_than_the_last_one_is_recorded_without_moving_last_worked_at_back` | `_refresh_last_worked_at`, recalculando pelo máximo em vez de atribuir |
| 7 | `a_marking_newer_than_the_last_one_moves_last_worked_at_forward` | — (contraparte do ciclo 6) |
| 8 | `marking_with_a_moment_in_the_future_is_refused` | `_refuse_implausible_moment` e a resolução do `now` injetado |
| 9 | `marking_at_the_current_moment_is_accepted` | — (borda: prova que a comparação é estrita) |
| 10 | `marking_more_than_ninety_days_ago_is_refused` | limite inferior e a constante `MAX_WORKED_AT_AGE` |
| 11 | `marking_exactly_ninety_days_ago_is_accepted` | — (borda inferior) |
| 12 | `a_refused_marking_leaves_no_log_and_no_trace_on_the_block` | — (efeito colateral de uma recusa) |
| 13 | `marking_a_block_of_another_congregation_is_not_found` | `_block_of_congregation` levantando `NotFoundError` |
| 14 | `a_resend_is_confirmed_even_after_the_visit_became_too_old_to_accept` | reordenação: idempotência antes da regra de relógio |
| 15 | `a_log_id_already_used_for_another_block_is_refused_instead_of_confirmed` | `_refuse_resend_for_another_block` |
| 16 | `marking_without_a_moment_of_its_own_reads_the_injected_clock` | — (prova que o relógio vem do `now_provider`) |
| 17 | `the_history_of_a_block_is_listed_from_the_most_recent_visit` | `list_by_block` |
| 18 | `the_history_of_a_block_of_another_congregation_is_not_found` | — (escopo reaproveitado do ciclo 13) |
| 19 | `the_history_of_a_block_never_worked_is_empty` | — (borda: coleção vazia) |
| 20 | `the_visits_of_a_deactivated_publisher_stay_in_the_history` | — (prova que a listagem não filtra por `is_active`) |
| 21 | `deleting_a_visit_falls_back_to_the_most_recent_one_left` | `delete`, com o mesmo recálculo do ciclo 6 |
| 22 | `deleting_the_only_visit_makes_the_block_never_worked_again` | — (borda: último log) |
| 23 | `deleting_a_visit_that_does_not_exist_is_not_found` | — |
| 24 | `deleting_a_visit_of_another_congregation_is_not_found` | — (escopo do delete pelo bloco do log) |

Os ciclos marcados com "—" passaram sem código novo: o comportamento já decorria de um
ciclo anterior. Nenhum deles é duplicata — cada um trava uma implementação alternativa
plausível (um upsert por `(block_id, user_id)`, uma comparação `>=` na borda, uma
listagem que filtrasse publicador inativo) e por isso ficou na suíte como regressão.

## O que foi feito

`WorkLogService` com três métodos e quatro regras privadas.

**`mark_worked`** devolve `(log, created)` — o par que a Task 19 usa para responder 201
em visita nova e 200 em reenvio. A ordem das checagens é a decisão central do método:

1. **posse do bloco** — quadra de outra congregação nem é reconhecida;
2. **log já armazenado** — o reenvio é confirmado, não julgado de novo;
3. **relógio** — só uma visita genuinamente nova é medida contra o `now`.

**`list_by_block`** e **`delete`** são escopados pela congregação através do bloco (no
`delete`, pelo bloco a que o log aponta). Ambos os caminhos de "não é seu" e "não existe"
terminam no mesmo `NotFoundError`.

**`_refresh_last_worked_at`** é a única escrita em `Block.last_worked_at` e roda depois de
toda inserção e de toda remoção, sempre relendo o máximo dos logs.

## Arquivos criados

- `server/app/services/work_log.py` — `WorkLogService` e a constante `MAX_WORKED_AT_AGE`
- `server/tests/services/test_work_log_service.py` — 24 testes, os dois fakes de
  repositório e as factories `draw_block` / `make_user`

## Arquivos modificados

Nenhum. A task foi cumprida sem tocar em outra camada.

## Decisões técnicas

**`last_worked_at` é recalculado, nunca atribuído.** A alternativa óbvia —
`set_last_worked_at(block, worked_at)` — passa no caminho feliz e falha exatamente no caso
que motivou o log existir: o celular que ficou dias sem sinal e sincroniza depois de
alguém que marcou ontem. Recalcular pelo `MAX` dos eventos resolve a inserção fora de
ordem e a remoção com a **mesma** linha de código, sem nenhum caso especial.

**A idempotência vem antes da regra de relógio.** Um log já armazenado é um fato; medi-lo
de novo contra o `now` pode recusar o que já foi aceito, e aí o celular reenviaria para
sempre uma marcação que o servidor nunca mais aceitaria. A posse do bloco, essa sim, vem
antes de tudo.

**Um `log_id` já gasto em outra quadra é recusado, não confirmado.** Não estava na task,
mas o caminho existe: como o id é cunhado no celular, tratar qualquer id conhecido como
reenvio devolveria uma visita — com bloco, publicador e horário — que a requisição não
nomeou, e o chamador só foi liberado para o bloco que pediu. Recusar custa três linhas.
Usa `DomainError` com mensagem própria em vez de uma exceção nova, porque a task proibia
tocar em `app/core/exceptions.py`; se o caso aparecer em produção, vale promovê-lo a uma
classe com `code` estável.

**Testes com fakes in-memory, não contra o PostGIS.** É o que o `CLAUDE.md` manda para
service não-geométrico, e aqui a razão é concreta: nada neste service é geometria — uma
quadra é só uma identidade, nunca um contorno. O banco custaria set-up (território,
polígono válido, quadra dentro dele) e não daria confiança nenhuma sobre estas regras. Os
fakes reproduzem os dois comportamentos em que o service se apoia: histórico do mais
recente para o mais antigo e `latest_worked_at` como máximo dos eventos. O que o PostGIS
de verdade prova — `ST_Within` na borda, `ST_Touches` na divisa — é exercitado pelas
suítes de território e de quadra, onde esses predicados *são* a regra.

**`(log, created)` em vez de um objeto de resultado.** Segue o que `AuthService.login` e
`UserService.activate` já fazem no projeto; o router desempacota e escolhe o status.

**Limite de 90 dias como constante exportada.** `MAX_WORKED_AT_AGE` fica no módulo e é
importada pelo teste de borda, para que o teste não repita o número mágico e continue
correto se o prazo mudar.

**Deliberadamente sem teste:** que o `worked_at` seja timezone-aware — é validação de
forma e já está garantida por `WorkedIn` (`AwareDatetime`) na camada de DTO, coberta em
`tests/schemas/test_work_log_schemas.py`.

## Como validar

```bash
cd server
uv run pytest tests/services/test_work_log_service.py -q
uv run pytest tests/services/test_work_log_service.py --cov=app.services.work_log --cov-report=term-missing --cov-branch
```

## Resultado da validação

- `uv run pytest tests/services/test_work_log_service.py -q` → **24 passed** em 0,22 s
- Cobertura de `app/services/work_log.py` → **100% de linha e 100% de branch**
  (49 statements, 10 branches, 0 miss) — sem precisar de banco
- `uv run pytest -q` (suíte inteira, contra o PostGIS real) → **295 passed**
- `uv run ruff check .` → All checks passed · `uv run ruff format --check .` → 52 files
  already formatted
