# [0129] Repositório: todas as designações da congregação (spec 0008, Task 02)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0008/` — Task 02

## Solicitação
> Spec 0008 — Task 02: Em `server/app/repositories/territory_assignment.py`, adicione o método
> `list_by_congregation(congregation_id: UUID) -> list[TerritoryAssignment]`: `join` em
> `Territory` filtrando `Territory.congregation_id` (mesmo raciocínio dos outros métodos da
> classe — dado de outra congregação nunca é carregado), ordenado por `started_at` **decrescente**
> (mais recente primeiro, como `list_by_territory` já faz). Carregue **user e território** junto
> com `joinedload`, seguindo o que a classe já faz para `user`: a listagem geral mostra os dois
> nomes em cada linha, então sem isso seria um SELECT por registro. Docstring explicando o porquê,
> no estilo dos métodos vizinhos. Valide com `uv run ruff check .`, `uv run ruff format --check .`
> e `uv run pytest tests -q` (nada deve regredir). Toque apenas
> `server/app/repositories/territory_assignment.py`; não modifique models, services ou rotas.

## Contexto
A página de Histórico do admin (spec 0008) mostra todas as designações da congregação de uma vez,
agrupadas por dirigente ou por território. O repositório só sabia listar o histórico de **um**
território (`list_by_territory`), então faltava a query que traz o conjunto inteiro — sem N+1 e
sem alcançar dado de outra congregação. É a base da Task 03 (service `list_all`) e da Task 04
(rota `GET /admin/assignments`).

## O que foi feito
Adicionado `list_by_congregation` ao `TerritoryAssignmentRepository`, entre `list_by_territory` e
`get_in_congregation`:

- `join` em `Territory` por `territory_id`, com `where Territory.congregation_id == congregation_id`
  — o escopo está na própria consulta, no mesmo padrão de `get_in_congregation`.
- `order_by(TerritoryAssignment.started_at.desc())`, igual a `list_by_territory`.
- `joinedload` de `user` **e** de `territory`.
- Docstring no estilo dos vizinhos, explicando o escopo pelo join, a razão da ordem e por que
  desta vez são dois relacionamentos carregados em vez de um.

## Arquivos modificados
- `server/app/repositories/territory_assignment.py` — novo método `list_by_congregation`

## Arquivos criados
—

## Decisões técnicas
- **Join explícito para o filtro + `joinedload` para a carga.** São dois papéis distintos: o
  `join(Territory, ...)` é a barreira de escopo, e o `joinedload` é o eager-load do DTO. O
  SQLAlchemy resolve o `joinedload` num alias próprio (`territories_1`), então os dois convivem
  sem interferência — confirmado inspecionando o SQL compilado. Reaproveitar o join do filtro com
  `contains_eager` deixaria o escopo e a carga acoplados: mudar um mexeria no outro.
- **`joinedload` também no território**, apesar de a classe até aqui só fazer isso para `user`: a
  linha da listagem geral é "publicador — território", então o `territory` é tão obrigatório
  quanto o `user`. Sem ele, um SELECT por registro.
- **Sem teste próprio nesta task.** O repositório não tem suíte dedicada no projeto; quem cobre
  esta query é a Task 03 (service `list_all`, em TDD contra o PostGIS real), incluindo o caso de
  isolamento entre congregações. A task delimitava explicitamente o toque a um único arquivo.
- Nada de models, services ou rotas foi tocado, e nenhum método existente mudou.

## Como validar
```bash
cd server
uv run ruff check .
uv run ruff format --check .
uv run pytest tests -q
```

## Resultado da validação
- `uv run ruff check .` → All checks passed!
- `uv run ruff format --check .` → 93 files already formatted
- `uv run pytest tests -q` → **495 passed** (mesmo total do baseline da spec; nenhuma regressão)
- SQL compilado inspecionado à mão: o `WHERE territories.congregation_id = ...` vem do join do
  filtro e o `territories_1` do `joinedload`, como esperado.
