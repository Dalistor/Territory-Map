# [0155] Rotas: o status forçado no PATCH da quadra e nas leituras

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0010/` — Task 04

## Solicitação
> Spec 0010 — Task 04: implemente por TDD, com os testes em `server/tests/routers/test_admin_blocks_routes.py`, `server/tests/routers/test_admin_territories_routes.py` e `server/tests/routers/test_app_client_routes.py` (arquivos existentes; acrescente casos).
>
> Em `server/app/routers/admin_blocks.py`, `patch_block` passa a repassar `status_override` ao service, **distinguindo ausente de nulo por `payload.model_fields_set`** e traduzindo no sentinela da Task 03 — um PATCH que só renumera não pode apagar o status que o admin forçou. Em `server/app/routers/admin_territories.py`, a função `block_out` passa a devolver `status_override`; como ela é o ponto único de montagem do DTO da quadra no admin (o router de blocos a importa), isso cobre a criação, a edição e a leitura do território de uma vez. Em `server/app/routers/app_client.py`, `_block_out` também passa a devolver o campo, porque o app precisa dele para colorir o mapa offline.
>
> Toque apenas na camada Routers (e nos testes dela); não modifique models, schemas, repositories ou services.

## Contexto
As Tasks 01–03 já tinham dado ao `Block` a coluna `status_override`, ao DTO os campos de
entrada e saída, e ao `BlockService.update` o sentinela `UNSET` que separa "não mexer" de
"voltar ao automático". Faltava o único degrau que torna tudo isso alcançável por HTTP: o
router. Sem ele o admin não consegue forçar a cor de uma quadra e nenhum dos dois clientes
recebe o campo nas leituras — o app, em particular, colore o mapa offline e precisa do valor
dentro do cache.

## Critérios de aceite
- `PATCH /admin/blocks/{id}` com `status_override: "overdue"` responde 200 com o campo preenchido
- Um `PATCH` só com `number` preserva o status forçado anterior
- `PATCH` com `status_override: null` devolve a quadra ao cálculo automático
- `PATCH` com `status_override: "recent"` (e variantes inválidas) responde 422
- `GET /admin/territories/{id}` traz o campo em cada quadra
- `GET /app/territories` também
- Marcar a quadra como trabalhada — pela rota do app ou pela do admin — e reler o território
  mostra o campo já nulo
- Quadra de outra congregação continua respondendo 404
- As rotas de admin continuam inalcançáveis com um token de app

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_forcing_the_status_answers_with_the_value_that_was_stored` | `tests/routers/test_admin_blocks_routes.py` | `block_out` devolve `status_override`; `patch_block` repassa o campo ao service |
| 2 | `test_a_patch_that_only_renumbers_leaves_the_forced_status_where_it_was` | idem | tradução de `model_fields_set` para o sentinela `UNSET` |
| 3 | `test_an_explicit_null_hands_the_block_back_to_the_automatic_colour` | idem | (confirmado pelo mesmo repasse) |
| 4 | `test_a_status_outside_the_two_the_map_paints_is_422` (3 parâmetros) | idem | (guarda de regressão do contrato HTTP) |
| 5 | `test_the_admin_marking_the_block_undoes_the_forced_status` | idem | (confirmado ponta a ponta pelo router) |
| 6 | `test_forcing_the_status_of_a_block_of_another_congregation_is_404` | idem | (fronteira de tenant preservada) |
| 7 | `test_the_detail_reports_the_forced_status_of_every_block` | `tests/routers/test_admin_territories_routes.py` | leitura do território pelo `block_out` já alterado |
| 8 | `test_the_map_carries_the_status_the_admin_pinned_on_a_block` | `tests/routers/test_app_client_routes.py` | `_block_out` devolve `status_override` |
| 9 | `test_a_block_nobody_pinned_reports_no_forced_status` | idem | (nulo é a quadra comum) |
| 10 | `test_marking_from_the_phone_undoes_the_forced_status` | idem | (confirmado ponta a ponta pela rota do app) |
| 11 | `test_pinning_a_status_with_an_app_token_is_401` | idem | (caso nomeado da varredura de rotas de admin) |

## O que foi feito
- `patch_block` ganhou o parâmetro `status_override`, traduzido de `payload.model_fields_set`
  para o sentinela `UNSET` do service quando a chave não veio no corpo. O docstring passou a
  registrar por que a decisão é pela presença da chave e não pelo valor.
- `block_out` (admin) e `_block_out` (app) passaram a montar o `BlockOut` com
  `status_override`. Como `block_out` é o ponto único de montagem do DTO no admin — o router
  de blocos a importa —, criação, edição e leitura do território passaram a reportar o campo
  numa mudança só.
- 13 casos de teste novos nos três arquivos de rota indicados.

## Arquivos modificados
- `server/app/routers/admin_blocks.py` — `patch_block` repassa `status_override`; import de `UNSET`
- `server/app/routers/admin_territories.py` — `block_out` devolve `status_override`
- `server/app/routers/app_client.py` — `_block_out` devolve `status_override`
- `server/tests/routers/test_admin_blocks_routes.py` — 8 casos novos (um parametrizado em 3)
- `server/tests/routers/test_admin_territories_routes.py` — 1 caso novo
- `server/tests/routers/test_app_client_routes.py` — 4 casos novos

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`model_fields_set` em vez do valor**, espelhando exatamente o que `patch_territory` já faz
  com `rotation_days` desde a spec 0009. É a única leitura que distingue "não mandei a chave"
  de "mandei null", e sem ela um `PATCH {"number": 7}` apagaria em silêncio a cor que o admin
  fixou.
- **O ciclo 2 foi validado contra a implementação ingênua.** Como o repasse do ciclo 1 já
  incluía a tradução do sentinela, o teste do ciclo 2 passaria de primeira; para provar que ele
  é significativo, a tradução foi trocada temporariamente por `status_override=payload.status_override`,
  o teste falhou (`assert None == 'never'`), e a tradução foi restaurada. Sem essa verificação o
  caso seria um teste que passa por acidente.
- **O teste da marcação pelo admin afirma o estado anterior antes de afirmar o posterior.**
  Sem a linha que confirma `"never"` antes do `POST .../worked`, o `is None` do final passaria
  vacuamente mesmo que o DTO nunca tivesse ganhado o campo.
- **Nenhum caso novo para "token de app alcança rota de admin" na varredura.** Ela já lê a
  tabela de rotas do próprio OpenAPI e cobre `PATCH /admin/blocks/{id}` sem manutenção; o que
  foi acrescentado é o caso nomeado, no estilo do que o arquivo já fazia para `POST /admin/territories`.
- **Nada fora da camada Routers foi tocado.** Models, schemas, repositories e services chegaram
  prontos das Tasks 01–03 e o `git diff` desta task confirma o escopo.

## Como validar
```bash
cd server && uv run pytest tests/routers/ -q
```

## Resultado da validação
- `uv run pytest tests/routers/ -q` → **138 passando**
- `uv run pytest -q` (suíte inteira do servidor) → **594 passando**
- `uv run ruff check .` → `All checks passed!`; `uv run ruff format .` aplicado
- Cobertura com `--cov=app --cov-branch` nos arquivos tocados:
  `app/routers/admin_blocks.py` 100% (0 branches parciais),
  `app/routers/admin_territories.py` 100%,
  `app/routers/app_client.py` 100% (2 branches, 0 parciais).
  Total do projeto: 95%. `app/services/` seguiu em 100% (portão de CI).
