# [0127] Schema do histórico com território embutido (spec 0008, Task 01)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0008/` — Task 01

## Solicitação
> Spec 0008 — Task 01: Em `server/app/schemas/territory.py`, crie `TerritoryBriefOut(OutSchema)`
> com `id: UUID` e `name: str`, espelhando `UserBriefOut` de `server/app/schemas/user.py`
> (docstring curta: o mínimo de um território para nomeá-lo numa listagem de outra coisa). Em
> `server/app/schemas/assignment.py`, crie `AssignmentWithTerritoryOut(AssignmentOut)` — herda os
> campos que já existem (`id`, `user`, `started_at`, `completed_at`) e acrescenta
> `territory: TerritoryBriefOut`, com docstring explicando que é o formato da listagem geral
> (`GET /admin/assignments`), onde cada registro precisa dizer de qual território é, ao contrário
> da listagem por território, em que isso já está na URL. Não altere `AssignmentOut` nem
> `AssignmentCreateIn`. Valide com `uv run ruff check .`, `uv run ruff format --check .` e
> `uv run pytest tests/schemas -q`. Toque apenas `server/app/schemas/territory.py` e
> `server/app/schemas/assignment.py`; não modifique outras camadas.

## Contexto
A spec 0008 cria a página de Histórico do admin, que precisa de **todas** as designações da
congregação numa chamada só (`GET /admin/assignments`, Task 04). Hoje só existe a listagem por
território, cujo DTO (`AssignmentOut`) não carrega o território — ele estava implícito na URL. Na
listagem geral cada linha vem de um card diferente, então o território precisa vir embutido, tanto
para agrupar na tela quanto porque a rota de apagar exige o `territory_id` no caminho.

## O que foi feito
Duas adições puras de DTO, sem tocar em nada existente:
- `TerritoryBriefOut(OutSchema)` em `schemas/territory.py`, com `id` e `name` — espelho exato de
  `UserBriefOut`.
- `AssignmentWithTerritoryOut(AssignmentOut)` em `schemas/assignment.py`, herdando `id`, `user`,
  `started_at` e `completed_at` e acrescentando `territory: TerritoryBriefOut`.

## Arquivos modificados
- `server/app/schemas/territory.py` — acrescentado `TerritoryBriefOut` ao final
- `server/app/schemas/assignment.py` — acrescentado o import de `TerritoryBriefOut` e a classe
  `AssignmentWithTerritoryOut` ao final

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Herança em vez de um DTO paralelo.** `AssignmentWithTerritoryOut(AssignmentOut)` mantém uma
  fonte única dos quatro campos comuns; duplicá-los faria as duas listagens divergirem em silêncio
  no dia em que um campo fosse acrescentado.
- **`TerritoryBriefOut` em `territory.py`, não em `assignment.py`.** O DTO é do território; quem
  precisa dele importa — mesma organização que já vale para `UserBriefOut`, que mora em `user.py` e
  é consumido por território, designação e work log.
- **Direção do import verificada.** `assignment.py` passa a importar `territory.py`, e
  `territory.py` não importa `assignment.py` — não há ciclo. Confirmado importando `app.main`.
- **`AssignmentOut` e `AssignmentCreateIn` intactos**, como a task pediu: a listagem por território
  continua respondendo exatamente o mesmo JSON, então nada que já consome a API muda.
- Sem teste novo: a camada de schemas valida forma, e esta task só declara dois DTOs sem validador
  nem normalização própria. O comportamento observável nasce na rota (Task 04), que já tem testes
  previstos na spec.

## Como validar
```bash
cd server
uv run ruff check .
uv run ruff format --check .
uv run pytest tests/schemas -q
```

## Resultado da validação
- `ruff check .` → **All checks passed!**
- `ruff format --check .` → **93 files already formatted**
- `pytest tests/schemas -q` → **94 passed**
- Sanidade extra: `python -c "from app.schemas.assignment import AssignmentWithTerritoryOut; import app.main"`
  importa sem ciclo, e os campos do modelo são
  `['completed_at', 'id', 'started_at', 'territory', 'user']`.
