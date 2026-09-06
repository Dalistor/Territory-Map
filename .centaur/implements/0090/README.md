# [0090] Rotas do app: `assigned_user` em `/app/territories` e nova `GET /app/worked-territories`

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0005/` — Task 09

## Solicitação

Em `server/app/routers/app_client.py`, atualizar `_territory_out` para incluir `assigned_user`
no `TerritoryOut` que ela monta (mesmo raciocínio já aplicado na rota do admin — o publicador
enxerga quem está designado a cada território para poder decidir o filtro do mapa). Adicionar a
rota `GET /app/worked-territories`, sem parâmetros além do token do app, chamando
`work_logs.list_worked_territories(user)` e devolvendo `list[WorkedTerritoryOut]` montado a
partir da tupla `(territory_id, name, last_worked_at)`. Escopo restrito a
`server/app/routers/app_client.py` — sem tocar services, schemas ou rotas do admin.

## Contexto

Parte da spec 0005 (app do publicador em React Native + designação de território). O modelo
(`Territory.assigned_user_id`, Task 02), os schemas (`TerritoryOut.assigned_user`,
`WorkedTerritoryOut`, Task 03) e o service (`WorkLogService.list_worked_territories`, Task 07) já
existiam prontos; faltava expor os dois no lado `/app/*`, espelhando o que a Task 08 já fez no
lado `/admin/*` (`app/routers/admin_territories.py::territory_out`).

## O que foi feito

1. `_territory_out` em `app_client.py` passou a preencher `assigned_user` a partir de
   `territory.assigned_user`, usando `UserBriefOut.model_validate(...)` quando existir e `None`
   quando não houver designação — mesmo padrão de `admin_territories.py`.
2. Nova rota `GET /app/worked-territories`, autenticada pelo `AppUser` (token do app), sem
   parâmetro de entrada. Chama `work_logs.list_worked_territories(user)` e monta a lista de
   `WorkedTerritoryOut` a partir da tupla `(territory_id, name, last_worked_at)` retornada pelo
   service.
3. Ajustei o docstring do módulo (que dizia "Two routes, and that is the point" / "no third
   verb") para não ficar desatualizado com a rota nova — o argumento de fundo (nenhum terceiro
   *verbo de escrita*) continua verdadeiro, `worked-territories` é só outra projeção de leitura do
   mesmo log; deixei isso explícito em vez de apagar a frase.

## Arquivos modificados

- `server/app/routers/app_client.py` — `_territory_out` ganhou `assigned_user`; nova rota
  `GET /app/worked-territories`; imports de `UserRepository`, `UserBriefOut` e
  `WorkedTerritoryOut`; docstring do módulo atualizado.

## Decisões técnicas

- **`UserRepository` entrou como dependência de `get_territory_service`** porque
  `TerritoryService.__init__` já exige um repositório de usuário (usado por outras regras do
  service, ex.: designação) — o construtor não mudou, só ganhou o argumento que já esperava.
  Confirmado lendo `TerritoryService.__init__` antes de editar.
- **`WorkedTerritoryOut` construído diretamente (não via `model_validate`)**, porque a tupla
  `(territory_id, name, last_worked_at)` não é um objeto ORM com atributos de mesmo nome — os
  campos batem por posição, não por atributo, então `WorkedTerritoryOut(id=..., name=...,
  last_worked_at=...)` é a forma direta, igual ao padrão usado em `_block_out`/`_territory_out`
  para os demais schemas de saída deste arquivo.
- **Nenhuma mudança em `services/`, `schemas/` ou `routers/admin_territories.py`** — os dois
  fizeram uso do que já existia (services 0083 e 0076), como pedido no escopo da task.

## Como validar

```bash
cd server
uv run ruff check app/routers/app_client.py
uv run ruff format --check app/routers/app_client.py
uv run pytest
```

Manualmente: com um território designado a um publicador e a servir via `POST /app/activate`,
`GET /app/territories` deve trazer `assigned_user` preenchido nesse território (e `null` nos
demais); depois de marcar ao menos uma quadra, `GET /app/worked-territories` deve listar esse
território com o `last_worked_at` da marcação mais recente.

## Resultado da validação

- `ruff check` e `ruff format --check`: sem problemas.
- `uv run pytest`: **459 passed, 4 failed, 6 errors** (mesma suíte completa do servidor).

Os 4 failed + 6 errors são **pré-existentes e fora do escopo desta task**, exatamente como
documentado nas implementações 0081/0087: efeito colateral da Task 06 (restrição de
`mark_worked` a território designado), em testes que marcam quadra via HTTP sem designar
território antes:

- `tests/routers/test_app_client_routes.py::test_marking_a_block_creates_the_log_and_the_next_read_shows_it`
- `tests/routers/test_app_client_routes.py::test_resending_the_same_log_id_answers_200_and_stores_nothing_new`
- `tests/integration/test_full_flow_integration.py::test_a_congregation_goes_from_empty_to_a_worked_block`
- `tests/integration/test_device_swap_integration.py::test_redeeming_on_a_new_phone_takes_the_access_away_from_the_old_one`
- `tests/integration/test_revocation_integration.py` — 6 erros (mesma causa, quadra marcada sem
  designação prévia)

Todos recebem `403` em vez do `201`/`200` esperado porque o publicador do teste nunca é designado
ao território antes de marcar a quadra. A rota de designação do admin (Task 08) e o
`assigned_user` agora expostos (esta task) são o que os deixa corrigíveis, mas os próprios
arquivos de teste ainda não foram atualizados para chamar
`PATCH /admin/territories/{id}/assignment` antes de marcar — fora do escopo desta task, que só
toca `server/app/routers/app_client.py`. Fica para quem fechar essas suítes (ou a Task 11, que já
nasce cobrindo o fluxo designado).
