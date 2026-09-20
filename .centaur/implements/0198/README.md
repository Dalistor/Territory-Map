# [0198] DTO e rota de territórios com o último trabalho

**Data:** 2026-09-05
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0014/` — Task 02

## Solicitação

Estender o retorno de território com um DTO aninhado explícito para o último trabalho,
preenchê-lo nas listagens e no detalhe, preservar o escopo por congregação e evitar consultas
por território ou por quadra.

## Contexto

O repositório da Task 01 já agrega o registro mais recente de trabalho por território. Faltava
transportar essa informação no contrato usado pelos clientes e integrá-la à composição das rotas.

## Critérios de aceite

- `TerritoryOut.last_work` traz nome do autor e `worked_at` quando há trabalho.
- `last_work` é `null` quando o território nunca foi trabalhado.
- Listagem e detalhe usam o mesmo formato.
- A consulta é feita em lote por congregação, sem consulta por território ou quadra.
- Registros de outra congregação não aparecem.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | DTO serializa último trabalho ou `null` | `server/tests/schemas/test_territory_schemas.py` | `LastWorkOut` e `TerritoryOut.last_work` |
| 2 | Listagem e detalhe retornam o mesmo resumo | `server/tests/routers/test_admin_territories_routes.py` | Integração do mapa agregado ao router admin |
| 3 | Trabalho de outra congregação é ignorado | `server/tests/routers/test_admin_territories_routes.py` | Filtro por congregação via `TerritoryService` |

## O que foi feito

`TerritoryService` recebeu o `BlockWorkLogRepository` e transforma a consulta agregada em um mapa
por `territory_id`. O router admin consulta esse mapa uma vez por resposta de listagem ou detalhe,
e o cliente app usa o mesmo caminho na listagem completa do mapa. O DTO aninhado preserva o
`user_name` armazenado no log dentro de `UserBriefOut`.

## Arquivos modificados

- `server/app/schemas/territory.py` — adiciona `LastWorkOut` e `last_work`.
- `server/app/services/territory.py` — integra a consulta agregada ao serviço.
- `server/app/routers/admin_territories.py` — preenche o campo em criação, listagem, detalhe e patch.
- `server/app/routers/app_client.py` — preenche o campo na listagem do mapa do app.
- `server/tests/schemas/test_territory_schemas.py` — cobre presença e ausência do resumo.
- `server/tests/routers/test_admin_territories_routes.py` — cobre formato consistente, ausência e isolamento.
- `server/tests/services/test_territory_service.py` — atualiza a composição do serviço.

## Decisões técnicas

O resumo usa `user` + `worked_at`, alinhado ao vocabulário de `WorkLogOut`. A consulta em lote da
Task 01 permanece na camada de repository; o service só adapta suas tuplas para lookup eficiente,
sem importar schemas para a regra de negócio. Nenhuma migration ou componente TypeScript foi alterado.

## Como validar

```bash
cd server
UV_CACHE_DIR=/tmp/territory-map-uv-cache uv run ruff check app/schemas/territory.py app/services/territory.py app/routers/admin_territories.py app/routers/app_client.py tests/schemas/test_territory_schemas.py tests/routers/test_admin_territories_routes.py
UV_CACHE_DIR=/tmp/territory-map-uv-cache uv run pytest tests/schemas/test_territory_schemas.py tests/routers/test_admin_territories_routes.py::test_drawing_a_territory_returns_it_with_the_points_in_order tests/routers/test_admin_territories_routes.py::test_listing_and_detail_return_the_same_last_work_summary tests/routers/test_admin_territories_routes.py::test_listing_does_not_expose_work_from_another_congregation -q
```

## Resultado da validação

Lint limpo. Os testes focados passaram: **29 testes**. A suíte completa foi iniciada, mas foi
interrompida após execução prolongada conforme solicitado; portanto não há resultado completo a
reportar. O acesso ao Postgres local foi necessário para os testes HTTP.
