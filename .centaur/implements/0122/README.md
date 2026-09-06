# [0122] Remoção da rota e do service antigos de designação (spec 0007, Task 06)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0007/` — Task 06

## Solicitação

> Spec 0007 — Task 06: Remova o caminho antigo de designação, que a Task 05 substituiu:
> (1) a rota `PATCH /admin/territories/{territory_id}/assignment` em
> `server/app/routers/admin_territories.py` (e o import de `TerritoryAssignmentIn` que ficar órfão);
> (2) o método `TerritoryService.assign_to_user` e o helper `_user_in_congregation` em
> `server/app/services/territory.py`, junto com o `UserRepository` do construtor **se ele não for
> mais usado por nenhum outro método** (confira antes; se ficar sem uso, remova o parâmetro e
> atualize os dois pontos que instanciam o service, `get_territory_service` em
> `admin_territories.py` e em `app_client.py`); (3) o schema `TerritoryAssignmentIn` em
> `server/app/schemas/territory.py`, se nada mais o referenciar. **Mantenha**
> `TerritoryRepository.set_assigned_user` — ele agora é o atualizador da projeção usado pelo
> `AssignmentService`. Atualize os testes afetados […]. Ao final, `uv run pytest -q` precisa ficar
> **100% verde** e `uv run pytest --cov=app --cov-report=term-missing` precisa manter
> `app/services/` em 100%.

## Contexto

A Task 05 desta spec entregou as quatro rotas de `/admin/territories/{id}/assignments`, que tratam a
designação como registro histórico (estilo S-13): abrir um período, concluí-lo com data, listar o
cartão e apagar uma linha. Com elas no lugar, o `PATCH .../assignment` da spec 0005 virou um segundo
caminho de escrita para o mesmo dado — e um caminho pior, porque escreve
`territories.assigned_user_id` direto, sem criar nem fechar linha nenhuma no histórico. Dois
gravadores concorrentes sobre uma coluna que agora é **projeção** do histórico deixariam a projeção
mentir. Esta task fecha o caminho antigo.

## O que foi feito

- Removida a rota `PATCH /admin/territories/{territory_id}/assignment` e o import órfão de
  `TerritoryAssignmentIn`.
- Removidos `TerritoryService.assign_to_user` e `TerritoryService._user_in_congregation`.
- Confirmado por busca que `self._users` só era lido por `_user_in_congregation`; o parâmetro
  `users: UserRepository` saiu do construtor do `TerritoryService`, e com ele o import de
  `UserRepository` nos dois pontos que instanciavam o service (`admin_territories.py` e
  `app_client.py`), onde o import também ficou órfão.
- Removido o schema `TerritoryAssignmentIn` — nada mais o referenciava.
- `TerritoryRepository.set_assigned_user` **mantido**, como pedido: é o `AssignmentService` quem o
  chama agora, para manter a projeção em dia.
- Testes: removidos os oito casos de `assign_to_user` de `test_territory_service.py`, junto com a
  fixture `make_user` (que só existia para eles) e os imports que ficaram sem uso; corrigida a
  construção do service na fixture. `test_admin_territories_routes.py` **não** precisou de mudança —
  a rota antiga nunca teve teste de router próprio (a cobertura dela vinha da integração).
- `test_territory_assignment_integration.py` reescrito sobre as rotas novas, preservando os cinco
  passos que ele já encadeava: designar, ler de volta pelos dois lados, marcar com sucesso, ser
  recusado como outra pessoa, ser recusado de novo depois que a designação acaba.

## Arquivos modificados

- `server/app/routers/admin_territories.py` — sai a rota `PATCH .../assignment`, o import de
  `TerritoryAssignmentIn`, o import de `UserRepository` e o argumento `users` do
  `get_territory_service`
- `server/app/routers/app_client.py` — mesma remoção do `UserRepository` na construção do
  `TerritoryService`
- `server/app/services/territory.py` — saem `assign_to_user`, `_user_in_congregation`, o campo
  `self._users` e o parâmetro `users` do construtor
- `server/app/schemas/territory.py` — sai `TerritoryAssignmentIn`
- `server/tests/services/test_territory_service.py` — saem os oito casos de `assign_to_user` e a
  fixture `make_user`; a fixture `service` deixa de passar `users`
- `server/tests/integration/test_territory_assignment_integration.py` — reescrito sobre
  `POST .../assignments` e `POST .../assignments/complete`
- `server/tests/integration/conftest.py` — `Api.assign_territory` passa a fazer `POST` na rota nova
  (e perde o parâmetro `user_id=None`, que não tem mais equivalente); nasce
  `Api.complete_assignment`
- `server/tests/integration/test_full_flow_integration.py` — a designação agora responde **201** com
  um `AssignmentOut` (`user`), não 200 com um `TerritoryOut` (`assigned_user`)

## Arquivos criados

Nenhum.

## Decisões técnicas

- **Dois arquivos além dos citados na task foram tocados, e não dava para evitar.** A instrução
  pedia `pytest -q` 100% verde, e `Api.assign_territory` — o helper compartilhado em
  `tests/integration/conftest.py` — era usado por **quatro** arquivos de integração
  (`test_full_flow`, `test_revocation`, `test_device_swap` e o de designação). Deixá-lo apontando
  para uma rota que não existe mais quebraria os três que a task não menciona. Apontar o helper
  para a rota nova conserta os três de uma vez; só `test_full_flow` precisou de ajuste próprio,
  porque era o único que afirmava o status e o corpo da resposta (200 + `assigned_user` virou 201 +
  `user`). Mesmo precedente da implementação 0099, que já tinha absorvido em conftest um efeito
  colateral de spec sobre esses mesmos arquivos.
- **`Api.assign_territory` perdeu o `user_id=None` em vez de ganhar um "se `None`, conclua".** Um
  helper que aceita `None` e silenciosamente chama outra rota esconderia justamente a mudança de
  modelo que esta spec faz: desfazer uma designação deixou de ser apagar um campo e passou a ser um
  evento com data. `complete_assignment` é um método separado por isso.
- **A fixture `make_user` de `test_territory_service.py` foi removida junto.** Ela existia
  exclusivamente para a regra de designação, que mudou de unidade — o `AssignmentService` já tem a
  sua, testada em `test_assignment_service.py`. Mantê-la sem uso deixaria o arquivo insinuando que o
  serviço de território ainda tem algo a ver com publicadores, o que deixou de ser verdade quando o
  `UserRepository` saiu do construtor.
- **`TerritoryRepository.set_assigned_user` ficou**, conforme a task: quem o chama agora é
  `AssignmentService._refresh_assigned_user`, o único lugar que mantém a projeção sincronizada com a
  linha aberta do histórico.
- **Não toquei em `app/services/assignment.py` nem em `app/routers/admin_assignments.py`**, como a
  task determinou.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d
cd server
uv run ruff check . && uv run ruff format --check .
uv run pytest -q
uv run pytest --cov=app --cov-report=term-missing
```

Verificar também, em `/docs`, que `PATCH /admin/territories/{territory_id}/assignment` não aparece
mais e que as quatro rotas de `/admin/territories/{territory_id}/assignments` estão lá.

## Resultado da validação

- `uv run ruff check .` — All checks passed
- `uv run ruff format --check .` — 92 files already formatted
- `uv run pytest -q` — **493 passed**
- `uv run pytest --cov=app --cov-report=term-missing` — `app/services/` inteiro em **100%**
  (`territory.py` 62/62, `assignment.py` 57/57, `block.py`, `user.py`, `work_log.py`, `auth.py`,
  `congregation.py` idem). Total do projeto: 95%. `app/routers/admin_territories.py` e
  `app/schemas/territory.py` também ficaram em 100%.

## Pendência conhecida (fora do escopo desta task)

O admin (Electron) ainda chama o `PATCH .../assignment` removido, em `admin/src/main/api-client.ts`.
Isso é exatamente o que a **Task 09** da spec 0007 trata ("Admin: cliente da API e handlers IPC das
designações"); a task 06 foi instruída a não sair do servidor. Até a Task 09 rodar, a designação
pela interface do admin responde 404.
