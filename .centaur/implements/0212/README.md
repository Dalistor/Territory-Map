# [0212] Consulta paginada de designações por congregação

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 01

## Solicitação

Adicionar ao `TerritoryAssignmentRepository` uma consulta paginada de designações da congregação,
com filtros opcionais de publicador, território e período semiaberto.

## Contexto

O histórico completo precisa selecionar apenas as designações que se sobrepõem ao período informado,
sem perder a separação entre congregações e sem carregar um território por linha exibida.

## Critérios de aceite

- Inclui designação iniciada antes e devolvida dentro do período.
- Inclui designação aberta iniciada antes do fim do período.
- Exclui designação iniciada exatamente no fim exclusivo.
- Inclui devolução exatamente no início do período.
- Combina filtros de publicador e território sem incluir outra congregação.
- Pagina com ordenação por início e id, sem repetição ou salto em empates.
- Retorna total independente de `limit` e `offset`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Inclui designação devolvida dentro do período | `server/tests/repositories/test_territory_assignment.py` | `list_page_by_congregation` com filtro de sobreposição e total |
| 2 | Inclui designação aberta, respeita as duas bordas temporais | `server/tests/repositories/test_territory_assignment.py` | Predicados inclusivo/exclusivo do intervalo semiaberto |
| 3 | Combina filtros e mantém isolamento de congregação | `server/tests/repositories/test_territory_assignment.py` | Filtros SQL opcionais no escopo do `Territory` |
| 4 | Desempata por id e mantém total entre páginas | `server/tests/repositories/test_territory_assignment.py` | Ordenação determinística e paginação após a contagem |

## O que foi feito

- Criada a consulta paginada com total antes de `limit`/`offset`.
- Aplicado o escopo da congregação no `JOIN` SQL e carregamento antecipado de `territory`.
- Preservado `list_by_congregation` para os consumidores do contrato ainda não migrados.

## Arquivos modificados

- `server/app/repositories/territory_assignment.py` — consulta paginada, filtrável e ordenada.

## Arquivos criados

- `server/tests/repositories/test_territory_assignment.py` — cobertura dos limites de sobreposição, filtros, isolamento e paginação.

## Decisões técnicas

O total usa a mesma seleção filtrada em uma subconsulta sem ordenação. Assim, a contagem não varia
com a página lida e o SQL continua sendo a única fonte de escopo da congregação.

## Como validar

```bash
cd server
uv run pytest tests/repositories/test_territory_assignment.py -q
uv run pytest -q
uv run ruff check app/repositories tests/repositories
```

## Resultado da validação

- `uv run pytest tests/repositories/test_territory_assignment.py -q` — 6 passando.
- `uv run pytest tests/repositories/test_territory_assignment.py --cov=app.repositories.territory_assignment --cov-report=term-missing -q` — 6 passando; 69% do arquivo inteiro, com as linhas novas da consulta cobertas.
- `uv run pytest -q` — 649 passando; 2 avisos preexistentes de depreciação.
- `uv run ruff check app/repositories tests/repositories` — sem problemas.
