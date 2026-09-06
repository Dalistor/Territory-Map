# [0142] Rotas: rotação no PATCH do território e `POST /admin/blocks/{id}/worked`

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0009/` — Task 05

## Solicitação

> Spec 0009 — Task 05: `patch_territory` passa a repassar `rotation_days` ao service, distinguindo
> ausente de nulo por `payload.model_fields_set` e traduzindo isso no sentinela da Task 03;
> `territory_out` devolve `rotation_days` na listagem e no detalhe. Em `admin_blocks.py`, acrescente
> `POST /admin/blocks/{block_id}/worked` (201, `AdminWorkedIn`, `WorkLogOut`, `mark_worked_by_admin`),
> documentando por que aqui não existe o 200-de-reenvio da rota do app e por que a designação não é
> consultada. Em `app_client.py`, `_territory_out` também devolve `rotation_days`. Toque apenas na
> camada Routers.

## Contexto

As Tasks 01–04 já tinham a coluna, os DTOs, o repositório/serviço com o sentinela `UNSET` e o
`WorkLogService.mark_worked_by_admin`. Faltava o HTTP: sem esta task, o admin não tem como configurar
a rotação nem registrar uma visita, e o app não recebe o número que colore o mapa offline.

## Critérios de aceite

- `PATCH` com `rotation_days: 60` responde 200 com `rotation_days: 60`.
- `PATCH` só com `name` mantém a rotação anterior (ausente ≠ nulo).
- `PATCH` com `rotation_days: null` volta ao nulo.
- `PATCH` com `rotation_days` fora de `[1, 3650]` responde 422 sem chegar ao service.
- `GET /admin/territories` e `GET /admin/territories/{id}` trazem o campo.
- `GET /app/territories` traz o campo, por território.
- `POST /admin/blocks/{id}/worked` responde 201 com o log e o publicador nomeado, e a leitura
  seguinte da quadra mostra `last_worked_at` atualizado.
- Duas chamadas seguidas criam dois logs (não há idempotência por id de cliente).
- Quadra ou publicador de outra congregação (e inexistentes) respondem 404, nunca 403.
- `worked_at` no futuro responde 422 com `code: invalid_worked_at` (o mapeamento de `app/main.py`
  não lista `InvalidWorkedAtError`, então ela cai no `DOMAIN_ERROR_DEFAULT_STATUS`, que é 422).
- `worked_at` de 200 dias atrás é aceito pelo admin, ao contrário da rota do app.
- Todas as rotas continuam exigindo o token de admin (401 sem ele).

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_setting_the_rotation_answers_with_the_number_that_was_stored` | `tests/routers/test_admin_territories_routes.py` | `patch_territory` repassa `rotation_days`; `territory_out` devolve o campo |
| 2 | `test_a_patch_that_only_renames_leaves_the_rotation_where_it_was` | idem | tradução de `model_fields_set` → `UNSET` (validada por mutação, ver Decisões) |
| 3 | `test_sending_the_rotation_as_null_puts_the_territory_back_on_the_default` | idem | — (mesmo código) |
| 4 | `test_a_rotation_outside_the_allowed_cycle_never_reaches_the_service` (0, -1, 3651) | idem | — (o `Field(ge=1, le=3650)` da Task 02) |
| 5 | `test_the_rotation_comes_back_in_the_listing_and_in_the_detail` | idem | — (mesmo `territory_out`) |
| 6 | `test_the_admin_marking_a_block_records_the_visit_under_the_chosen_publisher` | `tests/routers/test_admin_blocks_routes.py` | `POST /admin/blocks/{block_id}/worked` |
| 7 | `test_after_the_admin_marks_it_the_block_reads_back_as_worked` | idem | — |
| 8 | `test_marking_the_same_block_twice_records_two_visits` | idem | — |
| 9 | `test_marking_for_a_publisher_of_another_congregation_is_404` / `..._that_never_existed_is_404_too` | idem | — |
| 10 | `test_a_visit_dated_in_the_future_is_refused` | idem | — |
| 11 | `test_a_visit_older_than_the_apps_floor_is_accepted_from_the_admin` | idem | — |
| 12 | `test_a_block_of_another_congregation_is_404_and_not_403[worked]` | idem | — |
| 13 | `test_no_route_here_is_reachable_without_an_admin_token[worked]` | idem | — |
| 14 | `test_the_map_carries_the_rotation_the_admin_configured` | `tests/routers/test_app_client_routes.py` | `_territory_out` devolve `rotation_days` |

## O que foi feito

- `admin_territories.py`: `patch_territory` decide entre `payload.rotation_days` e o sentinela
  `UNSET` do service olhando `payload.model_fields_set`, e o docstring explica por que a decisão
  não pode ser tomada pelo valor. `territory_out` passou a incluir `rotation_days`, com uma nota de
  por que ele viaja também na listagem (é o número que colore o mapa inteiro).
- `admin_blocks.py`: rota nova `POST /admin/blocks/{block_id}/worked`, 201 fixo, chamando
  `mark_worked_by_admin`. O docstring registra as duas ausências deliberadas: não há 200-de-reenvio
  (o `log_id` é do servidor e não existe fila offline para reconhecer) e a designação não é
  consultada (ela protege o celular do publicador, não o admin que decide as designações).
- `app_client.py`: `_territory_out` inclui `rotation_days`, com a justificativa do cache offline.

## Arquivos modificados

- `server/app/routers/admin_territories.py` — `rotation_days` no PATCH e na saída
- `server/app/routers/admin_blocks.py` — rota de marcação pelo admin
- `server/app/routers/app_client.py` — `rotation_days` na saída do app
- `server/tests/routers/test_admin_territories_routes.py` — 5 casos novos (7 execuções com o parametrize)
- `server/tests/routers/test_admin_blocks_routes.py` — 7 casos novos + 2 parametrizes estendidos
- `server/tests/routers/test_app_client_routes.py` — 1 caso novo

## Arquivos criados

Nenhum.

## Decisões técnicas

- **`model_fields_set` em vez de `exclude_unset`.** O router já monta a chamada campo a campo; um
  `model_dump(exclude_unset=True)` daria o mesmo resultado ao custo de um dicionário intermediário
  e de o service passar a receber kwargs dinâmicos, o que apagaria a assinatura explícita.
- **Os ciclos 2–5 passaram já no primeiro RED**, porque o código do ciclo 1 os cobria. Em vez de
  aceitar isso, o teste do ciclo 2 foi validado por mutação: trocando a expressão por
  `rotation_days=payload.rotation_days` (a versão ingênua que a Task 03 avisa para não escrever),
  só ele falhou. Os ciclos 4 e 5 pinam contrato herdado das tasks anteriores — o 422 do
  `Field(ge=1, le=3650)` e o campo na listagem — e ficam como regressão.
- **`test_marking_for_a_publisher_that_never_existed_is_404_too` também passaria sem a rota** (o
  FastAPI responderia 404 por caminho inexistente). Ele só vira asserção significativa junto do
  ciclo 6, que prova que a rota existe e responde 201 no caminho feliz.
- **Nenhum teste de 200-de-reenvio nesta rota**, de propósito: não há `log_id` de cliente para
  reenviar. O que existe é o teste de que duas chamadas geram dois logs.
- **Sem novo fake.** Os testes de rota deste projeto rodam o app real sobre o PostGIS real com a
  sessão redirecionada para a transação revertida — o mesmo contrato dos vizinhos, então nada foi
  mockado aqui.

## Como validar

```bash
cd server
uv run pytest tests/routers/test_admin_territories_routes.py tests/routers/test_admin_blocks_routes.py tests/routers/test_app_client_routes.py -q
```

## Resultado da validação

- `uv run pytest tests/routers -q` → **125 passed**
- `uv run pytest --cov=app -q` (suíte inteira) → **558 passed**
- Cobertura de linha nos arquivos tocados: `admin_blocks.py` 100%, `admin_territories.py` 100%,
  `app_client.py` 100%
- Cobertura de branch (só `tests/routers`, com `--cov-branch`): 0 branches parciais nos três
  arquivos; a única linha descoberta nesse recorte (`app_client.py:163`) é coberta pela suíte
  completa e não foi tocada por esta task
- `uv run ruff check .` e `uv run ruff format --check .` → limpos
