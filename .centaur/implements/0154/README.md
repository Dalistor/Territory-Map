# [0154] Services: gravar o status forçado da quadra e limpá-lo quando chega trabalho novo

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0010/` — Task 03

## Solicitação
Spec 0010 — Task 03: por TDD, acrescentar `set_status_override` ao repositório da quadra, o
parâmetro `status_override` (com sentinela de três intenções) ao `BlockService.update`, e fazer
`WorkLogService.mark_worked` e `mark_worked_by_admin` limparem o override ao gravar um registro
novo — sem que um reenvio ou um apagamento mexam nele. Só as camadas Repositories e Services.

## Contexto
A coluna `Block.status_override` passou a existir na Task 01 e os DTOs na Task 02, mas nada
escrevia nela. Sem a regra que a **desfaz sozinha**, uma quadra forçada como "nunca trabalhada"
ficaria vermelha para sempre depois de ser trabalhada de verdade — a interface contradizendo o
histórico logo abaixo dela.

## Critérios de aceite
- `update` sem `status_override` não altera o valor existente, nem quando é nulo nem quando é `"overdue"`
- `update` com `"never"` grava `"never"`
- `update` com `status_override=None` (o valor real, não o sentinela) zera a coluna
- o status convive com renumerar e redesenhar na mesma chamada
- quadra de outra congregação continua respondendo `NotFoundError`
- marcar trabalho pelo app numa quadra com override deixa a coluna nula
- o mesmo para a marcação feita pelo admin
- um reenvio de `log_id` já gravado deixa o override como estava
- apagar um registro de trabalho **não** limpa o override

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `update_forcing_a_status_records_it_on_the_block` | `server/tests/services/test_block_service.py` | `BlockRepository.set_status_override`, o sentinela `UNSET` e o parâmetro `status_override` em `BlockService.update` |
| 2 | `update_with_a_null_status_puts_the_block_back_on_the_automatic_colour` | idem | ramo "voltar ao automático" do sentinela |
| 3 | `update_without_a_status_leaves_a_forced_one_untouched` | idem | ramo "não mexer" (padrão `UNSET`) |
| 4 | `update_without_a_status_leaves_an_automatic_block_automatic` | idem | — (guarda de regressão) |
| 5 | `update_forces_the_status_while_renumbering_and_redrawing_in_one_call` | idem | ordem entre `update` e `set_status_override` |
| 6 | `update_forcing_the_status_of_a_block_of_another_congregation_is_not_found` | idem | — (escopo por congregação já existente) |
| 7 | `marking_a_block_clears_the_status_the_admin_had_forced_on_it` | `server/tests/services/test_work_log_service.py` | `WorkLogService._clear_status_override`, chamado em `mark_worked` |
| 8 | `the_admin_marking_a_block_clears_the_status_they_had_forced_on_it` | idem | mesma chamada em `mark_worked_by_admin` |
| 9 | `resending_an_already_recorded_marking_leaves_the_forced_status_alone` | idem | — (o reenvio já retorna antes de gravar) |
| 10 | `deleting_a_visit_leaves_the_forced_status_alone` | idem | — (a limpeza fica *fora* de `_refresh_last_worked_at`, que `delete` também chama) |

## O que foi feito
- `BlockRepository.set_status_override(block, status)`, no estilo do `set_last_worked_at` vizinho:
  método próprio porque a coluna é nullable e `None` dentro de `update` já significa "não mexer".
- `BlockService.update` ganhou `status_override`, com o sentinela `UNSET` definido no próprio
  módulo e um comentário apontando para o gêmeo em `territory.py` (promovê-lo a um módulo comum
  mexeria nos imports do router de territórios, fora do escopo desta task). O padrão é `UNSET`, e a
  assinatura continua compatível com quem chama `update` com `number`/`points`.
- `WorkLogService._clear_status_override`, chamado logo depois de `_refresh_last_worked_at` nos
  dois pontos em que um registro novo é criado.

## Arquivos modificados
- `server/app/repositories/block.py` — novo `set_status_override`
- `server/app/services/block.py` — sentinela `UNSET`, parâmetro `status_override` em `update`
- `server/app/services/work_log.py` — `_clear_status_override` chamado por `mark_worked` e `mark_worked_by_admin`
- `server/tests/services/test_block_service.py` — 6 casos novos
- `server/tests/services/test_work_log_service.py` — `set_status_override` no fake do repositório e 4 casos novos

## Decisões técnicas
- **A limpeza fica fora de `_refresh_last_worked_at`.** Seria tentador embutir, já que os dois
  acontecem no mesmo ponto — mas `delete` também recomputa a projeção, e apagar um registro não
  pode repintar a quadra. Duas chamadas lado a lado nos dois métodos de marcação, e nenhuma em
  `delete`, expressam exatamente a regra sem flag booleana nem ramo extra.
- **O reenvio não precisou de código nenhum.** `mark_worked` já retorna antes de gravar quando o
  `log_id` é conhecido, então o override sobrevive por construção; o teste existe para prender esse
  comportamento no lugar.
- **Sentinela duplicado de propósito.** É um gêmeo declarado do `UNSET` de `territory.py`, com o
  comentário dizendo por que os dois não foram unificados e qual seria o momento de unificar.
- **Mock**: `test_block_service.py` roda contra PostGIS real (é onde a quadra vive); o work log usa
  os fakes in-memory que já existiam — nada ali é geométrico, e o fake do repositório de quadras
  ganhou `set_status_override` para manter a mesma interface do real.

## Como validar
```bash
cd server
uv run pytest tests/services/test_block_service.py tests/services/test_work_log_service.py -q
uv run pytest -q --cov=app --cov-branch --cov-report=term-missing
```

## Resultado da validação
- `uv run pytest -q` → **581 testes passando**, nenhuma regressão
- Cobertura com `--cov-branch`: `app/services/block.py` **100%** (67 linhas, 18 branches),
  `app/services/work_log.py` **100%** (78 linhas, 16 branches) — todo `app/services/` segue em 100%
  de linha e de branch, como o portão de CI exige. `app/repositories/block.py` em 98%, com a única
  linha descoberta (`get`) pré-existente a esta task.
- `uv run ruff check .` → All checks passed; `ruff format --check .` → 94 arquivos já formatados
- Os dois testes de "não mexer" foram validados por mutação: trocar o padrão `UNSET` por `None`, e
  ignorar o `None` explícito, cada um derruba exatamente um dos casos novos.
