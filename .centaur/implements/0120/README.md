# [0120] Servidor/Routers: as quatro rotas do histórico de designação (spec 0007, Task 05)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0007/` — Task 05

## Solicitação
> Spec 0007 — Task 05: Crie `server/app/routers/admin_assignments.py` seguindo o estilo de
> `server/app/routers/admin_blocks.py` (prefixo, `tags`, dependências `AdminCongregation` e a
> fábrica de service com `Annotated[..., Depends(...)]`, `utc_now` como `now_provider`). Rotas,
> todas escopadas pela congregação do token:
> - `GET /admin/territories/{territory_id}/assignments` → `list[AssignmentOut]`, chamando
>   `AssignmentService.list`.
> - `POST /admin/territories/{territory_id}/assignments`, corpo `AssignmentCreateIn`, status **201**
>   → `AssignmentOut`, chamando `designate`.
> - `POST /admin/territories/{territory_id}/assignments/complete` → `AssignmentOut`, chamando
>   `complete` (devolve o registro recém-encerrado, com a data de conclusão).
> - `DELETE /admin/territories/{territory_id}/assignments/{assignment_id}` → **204** sem corpo,
>   chamando `delete`. Note que o `territory_id` da URL não é usado pelo service (o
>   `assignment_id` já é validado contra a congregação): mantenha-o na rota mesmo assim, por
>   coerência de hierarquia REST, e comente isso.
> Registre o router em `server/app/main.py` (`app.include_router(admin_assignments.router)`), junto
> dos outros. Escreva também os testes de rota em
> `server/tests/routers/test_admin_assignments_routes.py`, no padrão de
> `server/tests/routers/test_admin_blocks_routes.py`: caminho feliz de cada rota (incluindo os
> status 201/204), 404 para território de outra congregação, e 401 sem token de admin. Valide com
> `uv run pytest tests -q`, `uv run ruff check .` e `ruff format --check .`. Toque apenas
> `server/app/routers/admin_assignments.py`, `server/app/main.py` (só a linha do include) e o
> arquivo de teste novo; não modifique services, schemas ou as outras rotas.

## Contexto
O `AssignmentService` (Task 04, implementação 0119) e os schemas `AssignmentCreateIn`/`AssignmentOut`
(Task 02, implementação 0115) já existiam, mas não havia nenhuma porta HTTP para eles: o histórico de
designação da spec 0007 era inalcançável pelo admin. Esta task é a camada de router que expõe o ciclo
de vida completo de uma linha do cartão S-13 — listar, abrir, encerrar e apagar —, sem regra de
negócio nova.

## O que foi feito
- Criado o router `admin_assignments`, com prefixo `/admin/territories/{territory_id}/assignments` e
  tag `admin: assignments`, e a fábrica `get_assignment_service` montando o service sobre a sessão da
  requisição, os três repositórios e `utc_now` como `now_provider`.
- As quatro rotas pedidas, todas atrás de `AdminCongregation` e escopadas pela congregação do token:
  `GET ""`, `POST ""` (201), `POST "/complete"` e `DELETE "/{assignment_id}"` (204 sem corpo).
- Router registrado em `app/main.py`, entre `admin_territories` e `admin_blocks`. O import de
  `app.routers` passou a ser multilinha por causa do limite de 100 colunas do ruff — é a mesma
  linha de include, só reformatada pelo `ruff format`.
- Testes de rota novos: caminho feliz das quatro rotas (incluindo os status 201 e 204 com corpo
  vazio), 404 para publicador de outra congregação, 404 para território de outra congregação nas
  quatro rotas (parametrizado), 404 ao concluir sem designação aberta, e 401 sem token nas quatro.

## Arquivos modificados
- `server/app/main.py` — import de `admin_assignments` e `app.include_router(admin_assignments.router)`

## Arquivos criados
- `server/app/routers/admin_assignments.py` — as quatro rotas do histórico de designação
- `server/tests/routers/test_admin_assignments_routes.py` — 14 casos cobrindo caminho feliz, escopo de congregação e ausência de token

## Decisões técnicas
- **Prefixo no router, não caminho completo em cada rota.** Ao contrário de `admin_blocks.py` — que
  não declara prefixo porque agrupa dois caminhos diferentes (`/admin/territories/{id}/blocks` e
  `/admin/blocks/{id}`) —, as quatro rotas aqui compartilham a mesma base, então o prefixo declara
  a hierarquia uma vez, como em `admin_territories.py`.
- **`territory_id` mantido no `DELETE` mesmo sem ser usado.** O service filtra o `assignment_id`
  pela congregação numa única query (`TerritoryAssignmentRepository.get_in_congregation`), então o
  território seria uma checagem redundante. Ele fica na URL porque um registro se apaga onde se lê:
  mover a exclusão para `/admin/assignments/{id}` daria dois endereços ao mesmo recurso. O comentário
  no parâmetro e a docstring dizem isso. Não foi usado `# noqa: ARG001` porque a regra `ARG` não está
  habilitada no `pyproject.toml` — um noqa inativo confundiria mais do que explicaria.
- **`AssignmentOut.model_validate(...)` explícito**, como em `list_work_logs` de `admin_blocks.py`,
  em vez de confiar só na anotação de retorno.
- **`complete` devolve 200 com o registro encerrado**, não 204: a data de conclusão é a informação
  que o admin quer ver de volta, e devolvê-la evita uma releitura do cartão.
- **Publicador criado direto pela sessão nos testes** (fixture `make_publisher`), mesma decisão já
  tomada em `test_admin_blocks_routes.py`: passar por `/admin/users` amarraria estes testes a uma
  rota que tem suíte própria.

## Como validar
```bash
docker compose -f docker-compose.dev.yml up -d
cd server && uv run pytest tests/routers/test_admin_assignments_routes.py -q
```
Ou manualmente com o servidor no ar: designar um publicador a um território
(`POST /admin/territories/{id}/assignments`), listar (`GET`), concluir (`POST .../complete`) e
conferir que `GET /admin/territories/{id}` volta com `assigned_user` nulo.

## Resultado da validação
- `uv run pytest tests/routers/test_admin_assignments_routes.py -q` → 14 passed
- `uv run pytest tests -q` → **501 passed**, nenhuma regressão nas rotas existentes
- `uv run ruff check .` → All checks passed
- `uv run ruff format --check .` → 92 files already formatted
