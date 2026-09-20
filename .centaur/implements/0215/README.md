# [0215] Contrato HTTP paginado do histórico de designações

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 02

## Solicitação

Implementar o contrato paginado de `GET /admin/assignments`, com filtros opcionais,
validação de período e resposta explícita para os dois admins.

## Contexto

O histórico geral era uma lista sem paginação. A consulta agora precisa suportar páginas
estáveis, filtros combináveis e períodos por sobreposição, preservando o escopo da
congregação que já é aplicado pelo repositório.

## Critérios de aceite

- A resposta inclui `items`, `total`, `page` e `page_size`.
- `from`, `to`, `publisher_id`, `territory_id`, `page` e `page_size` são opcionais;
  página começa em 1, tamanho padrão é 50 e máximo é 100.
- Instantes com offset são normalizados para UTC, sem interpretar novamente o dia local;
  período vazio, invertido ou sem timezone é recusado.
- O service apenas transmite escopo, filtros e offset ao repositório paginado.
- A rota mantém isolamento por congregação e documenta o intervalo semiaberto.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Congregação sem designações recebe página vazia | `server/tests/routers/test_admin_assignments_routes.py` | DTO de página e resposta da rota |
| 2 | Query normaliza offset para UTC e rejeita períodos inválidos | `server/tests/schemas/test_assignment_schemas.py` | DTO de filtros e validação |
| 3 | Service encaminha filtros, limite e offset | `server/tests/services/test_assignment_service.py` | Orquestração paginada no service |
| 4 | Página intermediária, filtros combinados, 422 e isolamento | `server/tests/routers/test_admin_assignments_routes.py` | Regressões do contrato contra banco real |
| 5 | Conversão HTTP dos filtros, escopo e 422 sem SQL | `server/tests/routers/test_admin_assignment_history_query.py` | Parâmetros query e composição da página na rota |

## O que foi feito

- Adicionados `AssignmentHistoryQuery` e `AssignmentHistoryPageOut`.
- `AssignmentService.list_page` encaminha a consulta já paginada ao repositório da Task 01.
- `GET /admin/assignments` passou a converter filtros HTTP em DTO, devolver metadados de
  paginação e explicar seu contrato no docstring.
- Atualizados os testes de rota anteriores e incluídos os cenários do novo contrato.

## Arquivos modificados

- `server/app/schemas/assignment.py` — DTOs de filtro e página, normalização UTC e validação.
- `server/app/services/assignment.py` — orquestração da consulta paginada.
- `server/app/routers/admin_assignments.py` — parâmetros HTTP, resposta paginada e documentação.
- `server/tests/routers/test_admin_assignments_routes.py` — contrato HTTP e regressões.
- `server/tests/routers/test_admin_assignment_history_query.py` — conversão HTTP sem banco.
- `server/tests/services/test_assignment_service.py` — encaminhamento de consulta pelo service.

## Arquivos criados

- `server/tests/schemas/test_assignment_schemas.py` — validação e normalização do DTO de consulta.

## Decisões técnicas

O DTO de query rejeita instantes sem timezone. O cliente escolhe a fronteira local do dia;
o servidor só preserva aquele instante ao convertê-lo para UTC, sem inferir fuso da congregação.

## Como validar

```bash
cd server
uv run pytest tests/schemas/test_assignment_schemas.py tests/services/test_assignment_service.py::test_list_page_passes_the_congregation_filters_and_offset_to_the_repository tests/routers/test_admin_assignment_history_query.py --cov=app.schemas.assignment --cov=app.services.assignment --cov=app.routers.admin_assignments --cov-branch -q
uv run pytest tests/routers/test_admin_assignments_routes.py -q
uv run ruff check app/schemas/assignment.py app/services/assignment.py app/routers/admin_assignments.py tests/schemas/test_assignment_schemas.py tests/services/test_assignment_service.py tests/routers/test_admin_assignments_routes.py
```

## Resultado da validação

O comando unitário/HTTP sem banco passou: 7 testes. A cobertura medida foi 96% em
`app/schemas/assignment.py`, 79% no router e 37% no service inteiro (o método novo foi
executado; as linhas descobertas pertencem aos fluxos de ciclo de vida existentes).
Ruff passou nos arquivos tocados. Os testes de rota que usam Postgres e a suíte completa
não puderam iniciar porque o PostgreSQL de testes em `127.0.0.1:5432` recusou conexão e
o Docker Desktop local não respondeu durante a tentativa de subir `docker-compose.dev.yml`.
Essa limitação não é tratada como validação concluída.
