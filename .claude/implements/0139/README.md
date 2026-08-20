# [0139] DTOs: `rotation_days` no território e o corpo da marcação do admin

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0009/` — Task 02

## Solicitação
Spec 0009 — Task 02: `TerritoryOut` e `TerritoryPatchIn` ganham `rotation_days` (validado com
`ge=1`/`le=3650` no patch), e `server/app/schemas/work_log.py` ganha `AdminWorkedIn` com
`user_id: UUID` e `worked_at: AwareDatetime`, sem `log_id`. Testes acrescentados aos arquivos
existentes `server/tests/schemas/test_territory_schemas.py` e `test_work_log_schemas.py`.

## Contexto
A spec 0009 dá ao território um tempo de rotação próprio (nulo = o padrão de 120 dias que os dois
clientes já aplicam) e deixa o admin marcar quadra como trabalhada. Esta task entrega só os
contratos de borda: a coluna já existe (Task 01), e quem grava e decide são as Tasks 03–05.

Duas sutilezas de contrato ficam decididas aqui:

- No patch, **ausente e nulo são intenções diferentes** — "não mexer" e "voltar ao padrão". O
  schema não pode colapsar as duas; quem as distingue é o router, por `model_fields_set`. Por isso
  o campo é `int | None = None` com limite só no número, e não um sentinela no próprio DTO.
- `AdminWorkedIn` **não tem `log_id`**. O id do cliente existe para a fila offline do celular
  reconhecer um reenvio; o admin não tem fila, então o id é do servidor.

## Critérios de aceite
- `TerritoryPatchIn` aceita `rotation_days` ausente e `rotation_days=None`, e os dois casos são
  distinguíveis por `model_fields_set`
- `TerritoryPatchIn` aceita `1`, `120` e `3650`; rejeita `0`, `-1` e `3651`
- `TerritoryOut` serializa `rotation_days` nulo e preenchido
- `AdminWorkedIn` aceita `worked_at` com offset e rejeita um sem offset
- `AdminWorkedIn` rejeita `user_id` que não seja UUID
- `AdminWorkedIn` rejeita corpo sem `user_id` e corpo sem `worked_at`
- `AdminWorkedIn` não expõe `log_id`

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_territory_patch_in_tells_an_absent_rotation_from_an_explicit_null` | `server/tests/schemas/test_territory_schemas.py` | `TerritoryPatchIn.rotation_days: int \| None = None` |
| 2 | `test_territory_patch_in_accepts_a_rotation_from_one_day_to_ten_years` / `..._rejects_a_rotation_outside_...` (parametrizados) | idem | os limites `ge=1`/`le=3650` via `Field` |
| 3 | `test_territory_out_serialises_a_territory_that_uses_the_default_rotation` / `test_territory_out_carries_the_rotation_the_admin_configured` | idem | `TerritoryOut.rotation_days: int \| None = None` + docstring |
| 4 | `test_admin_worked_in_*` (7 casos, incluindo os parametrizados) | `server/tests/schemas/test_work_log_schemas.py` | a classe `AdminWorkedIn` |

## O que foi feito
- `TerritoryPatchIn` ganhou `rotation_days: int | None = Field(default=None, ge=1, le=3650)`, com
  docstring explicando por que ausente e nulo não podem ser colapsados.
- `TerritoryOut` ganhou `rotation_days: int | None = None`, com docstring registrando que nulo é
  "usa o ciclo padrão" e que o campo viaja também na listagem, porque o app colore o mapa offline.
- `AdminWorkedIn` foi criada logo acima de `WorkLogOut`, com docstring contrastando com o
  `WorkedIn` do app: sem `log_id` (não há fila offline), com `user_id` (o admin registra o trabalho
  de outra pessoa) e com `AwareDatetime` pelo mesmo motivo de lá — o service compara o momento
  contra um relógio, e um timestamp ingênuo não é um ponto na linha do tempo.
- O teste pré-existente `test_territory_out_carries_the_boundary_and_the_blocks_inside_it` afirma o
  conjunto exato de chaves de `model_dump()`; `rotation_days` foi acrescentado a esse conjunto. É a
  única alteração num teste que já existia, e ela reflete uma mudança real de contrato, não um
  afrouxamento.

## Arquivos modificados
- `server/app/schemas/territory.py` — `rotation_days` em `TerritoryPatchIn` e `TerritoryOut`
- `server/app/schemas/work_log.py` — nova classe `AdminWorkedIn`
- `server/tests/schemas/test_territory_schemas.py` — 5 testes novos; conjunto de chaves atualizado
- `server/tests/schemas/test_work_log_schemas.py` — 6 testes novos (9 casos com parametrização)

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Os limites ficam no `Field`, não num validator.** `ge`/`le` são validação de forma, que é
  exatamente o que a camada Schemas pode fazer; um dia a mais ou a menos não é regra de negócio.
- **O sentinela de "não mexer" não vive no DTO.** Colocá-lo aqui obrigaria o schema a conhecer a
  intenção do service. O DTO só guarda "veio ou não veio" (`model_fields_set`), e a tradução para o
  sentinela é da Task 05, no router — como a spec determina.
- **Nada foi mockado.** São modelos Pydantic puros; os testes instanciam de verdade e usam
  `SimpleNamespace` para o caminho `model_validate(row)`, seguindo o estilo já adotado no arquivo.
- Só a camada Schemas foi tocada: models, repositories, services e routers permanecem intactos.

## Como validar
```bash
cd server && uv run pytest tests/schemas/test_territory_schemas.py tests/schemas/test_work_log_schemas.py -q
```

## Resultado da validação
- `uv run pytest -q` → **522 passed**, nenhuma falha
- `uv run pytest -q --cov=app/schemas --cov-report=term-missing` → `app/schemas/territory.py` **100%**
  e `app/schemas/work_log.py` **100%** (sem linhas descobertas)
- `uv run ruff check .` → `All checks passed!`; `uv run ruff format --check .` → 93 arquivos já formatados
