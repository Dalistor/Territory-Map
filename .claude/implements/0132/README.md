# [0132] Rota `GET /admin/assignments`: o histórico inteiro da congregação

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0008/` — Task 04

## Solicitação
Adicionar a rota `GET /admin/assignments` devolvendo `list[AssignmentWithTerritoryOut]`,
chamando `AssignmentService.list_all`, escopada pela congregação do token. Como o router
existente tem prefixo `/admin/territories/{territory_id}/assignments`, criar um segundo
`APIRouter` no mesmo arquivo, exportá-lo e registrá-lo em `main.py` com um comentário curto
explicando o porquê dos dois. Testes: caminho feliz com território e publicador preenchidos e na
ordem certa, lista vazia, 401 sem token, e isolamento entre congregações.

## Contexto
A página de Histórico do admin (spec 0008) precisa de todas as designações da congregação numa
chamada só, com o território embutido para poder agrupar por dirigente ou por território e para
montar a URL do `DELETE /admin/territories/{territory_id}/assignments/{assignment_id}`. Até aqui
só existia o histórico de **um** território.

## O que foi feito
- `flat_router = APIRouter(prefix="/admin/assignments", tags=["admin: assignments"])` no mesmo
  módulo do router da carteira S-13, com a rota `GET ""` (`list_all_assignments`), que resolve a
  congregação pelo token (`AdminCongregation`), chama `AssignmentService.list_all` e converte cada
  model em `AssignmentWithTerritoryOut`.
- Docstring do módulo ampliada explicando por que existem dois routers no arquivo.
- `flat_router` incluído em `app/main.py` logo abaixo de `admin_assignments.router`, com comentário
  de três linhas.
- Nove testes novos em `tests/routers/test_admin_assignments_routes.py`, num bloco próprio ao fim
  do arquivo (na prática cinco funções, uma delas cobrindo dois assertos de ordem).

## Arquivos modificados
- `server/app/routers/admin_assignments.py` — `flat_router`, rota `list_all_assignments`, import de
  `AssignmentWithTerritoryOut`, docstring do módulo
- `server/app/main.py` — `include_router(admin_assignments.flat_router)` e o comentário
- `server/tests/routers/test_admin_assignments_routes.py` — bloco de testes da listagem geral

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Dois `APIRouter` no mesmo módulo, em vez de um módulo novo.** O prefixo é propriedade do
  router, não da rota, então as duas formas de endereçar a designação não cabem no mesmo objeto.
  Separar em `admin_assignments_flat.py` espalharia a superfície HTTP de um mesmo recurso por dois
  arquivos sem ganho — a dependência `get_assignment_service` e o `Assignments` já vivem aqui e são
  reaproveitados pelo router novo tal como estão.
- **Sem service ou repositório novo.** A rota é orquestração pura: sessão, token, service, DTO. O
  escopo por congregação continua sendo o `WHERE` da query (Task 02), não uma filtragem em Python.
- **`draw_offset_territory` no teste.** Territórios da mesma congregação não podem se sobrepor, e o
  `draw_territory` que o arquivo já tinha usa sempre o mesmo `SQUARE`; o teste que precisa de dois
  territórios desloca a latitude em 2 graus.

## Como validar
```bash
cd server && uv run pytest tests/routers/test_admin_assignments_routes.py -q
```
Manualmente: com o servidor no ar e um JWT de admin,
`GET /admin/assignments` devolve a lista de designações da congregação, mais recente primeiro,
cada registro com `territory: {id, name}` e `user: {id, name}`.

## Resultado da validação
- `uv run pytest tests -q` → **504 passed** (eram 495 antes desta task)
- `uv run ruff check .` → All checks passed
- `uv run ruff format --check .` → 93 files already formatted
