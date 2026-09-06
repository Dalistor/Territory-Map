# [0118] Repositório de designações de território (spec 0007, Task 03)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0007/` — Task 03

## Solicitação
> Spec 0007 — Task 03: Crie `server/app/repositories/territory_assignment.py` com
> `TerritoryAssignmentRepository`, seguindo o estilo de
> `server/app/repositories/block_work_log.py` (construtor recebendo `Session`, docstrings
> explicando o porquê de cada query, `flush()` depois de escrever). Métodos:
> `create(territory_id, user_id, started_at)`; `get_open(territory_id)`;
> `list_by_territory(territory_id)` ordenada por `started_at` decrescente;
> `get_in_congregation(congregation_id, assignment_id)` com `join` em `Territory`;
> `close(assignment, completed_at)`; `delete(assignment)`. Carregue o `user` junto onde fizer
> sentido para o `AssignmentOut` não disparar N+1. Valide com `ruff check`, `ruff format --check`
> e `pytest tests -q`. Toque apenas o arquivo novo.

## Contexto
A spec 0007 transforma a designação de território em registro histórico (estilo S-13). O model
`TerritoryAssignment` já existia (Task 01, implementação 0117), com o índice único parcial que
garante uma única designação aberta por território. Faltava a camada de acesso a dados que o
service da Task 04 vai consumir: criar, achar a aberta, listar o histórico, achar por id dentro da
congregação, encerrar e apagar.

## O que foi feito
Criado `TerritoryAssignmentRepository` com os seis métodos pedidos, no mesmo estilo de
`BlockWorkLogRepository`: construtor recebendo `Session`, docstrings explicando o porquê de cada
query, `flush()` depois de toda escrita e nenhum `commit` (a transação continua sendo do
`get_session()`).

## Arquivos criados
- `server/app/repositories/territory_assignment.py` — acesso a dados da tabela
  `territory_assignments`.

## Arquivos modificados
Nenhum.

## Decisões técnicas
- **`joinedload(TerritoryAssignment.user)` nas três leituras** (`get_open`, `list_by_territory`,
  `get_in_congregation`). Não havia precedente de eager loading em `app/repositories/` — o grep por
  `joinedload`/`selectinload` não retornou nada —, então a escolha está justificada na docstring da
  classe: o relacionamento é many-to-one e sempre necessário (o `AssignmentOut` carrega o nome do
  publicador), e um join resolve em uma ida ao banco em vez de um SELECT por linha do histórico.
  `selectinload` faria sentido para coleção; aqui seria uma segunda query sem ganho.
- **`get_open` usa `one_or_none()`**, e não `first()`: o índice parcial
  `uq_territory_assignments_open` garante no máximo uma linha aberta por território, então mais de
  uma linha é bug e deve estourar, não ser silenciosamente escondida por um `LIMIT 1`.
- **`get_in_congregation` filtra no mesmo statement**, com `join` em `Territory` — mesmo raciocínio
  de `BlockRepository.get_in_congregation`: nunca carregar a linha de outra congregação é mais
  barato e mais seguro que carregar e conferir depois.
- **`create` recebe `started_at` de fora**: a data é a que o admin digitou no cartão, e o AGENTS.md
  proíbe o service/repositório de ler o relógio.
- **`delete` apaga de verdade** (sem soft delete) e **`close`/`delete` não recalculam
  `Territory.assigned_user_id`** — a projeção é responsabilidade do service, exatamente como
  `Block.last_worked_at` é do service de trabalho. Documentado nas docstrings.
- **Sem teste próprio**: `server/tests/` não tem pasta `repositories/` — repositórios são cobertos
  indiretamente pelos testes de service contra o PostGIS real, e a Task 04 (TDD) é quem vai
  exercitar estes métodos. Manter a convenção existente em vez de abrir uma pasta nova.

## Como validar
```bash
cd server
uv run ruff check .
uv run ruff format --check .
uv run pytest tests -q
```

## Resultado da validação
- `ruff check .` — All checks passed!
- `ruff format --check .` — 88 files already formatted
- `pytest tests -q` — **470 passed**, 2 warnings (pré-existentes: `crypt` deprecado no passlib e
  `httpx` no TestClient). Nada regrediu.
