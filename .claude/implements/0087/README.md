# [0087] Service: `TerritoryService.assign_to_user`

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0005/` — Task 05

## Solicitação
Implementar `TerritoryService.assign_to_user(congregation_id, territory_id, user_id)`, que designa
(ou remove a designação de) um território a um publicador, sempre dentro da congregação de quem
chama — reusando `TerritoryRepository.set_assigned_user` (Task 04) e um `UserRepository` novo no
construtor do serviço, propagado nos dois `get_territory_service` que hoje o instanciam.

## Contexto
É a regra de negócio central da spec 0005 (designação de território a publicador): o admin escolhe
quem é o responsável por um território, o app do publicador passa a exibir essa designação (Task
09) e `WorkLogService.mark_worked` (Task 06, já implementada em 0081) já rejeita marcar quadra de
território não designado. Sem este método o admin não tem como escrever a designação.

## Critérios de aceite
- Designar um território existente a um publicador ativo da mesma congregação seta
  `assigned_user_id` para o `id` do publicador.
- Chamar com `user_id=None` remove a designação, mesmo que já houvesse uma.
- Designar a um publicador diferente do já designado substitui direto, sem erro.
- `territory_id` inexistente ou de outra congregação levanta `NotFoundError`.
- `user_id` inexistente ou de um publicador de outra congregação levanta `NotFoundError` (mesma
  exceção genérica do território, para não revelar qual dos dois falhou).
- Publicador com `is_active=False` pode ser designado normalmente.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_assign_to_user_sets_the_assigned_user` | `server/tests/services/test_territory_service.py` | `UserRepository` no `__init__` de `TerritoryService`; método `assign_to_user` com o caminho feliz e a checagem `_user_in_congregation` |
| 2 | `test_assign_to_user_with_none_clears_an_existing_assignment` | idem | (já coberto pela implementação do ciclo 1 — `user_id=None` pula a checagem e chama o repositório direto) |
| 3 | `test_assign_to_user_to_someone_else_replaces_the_previous_publisher` | idem | idem |
| 4 | `test_assign_to_user_with_a_nonexistent_territory_id_is_not_found` | idem | `self.get(...)` já levanta `NotFoundError` — reuso, sem código novo |
| 5 | `test_assign_to_user_of_a_territory_of_another_congregation_is_not_found` | idem | idem |
| 6 | `test_assign_to_user_with_a_nonexistent_user_id_is_not_found` | idem | `_user_in_congregation` retornando `False` |
| 7 | `test_assign_to_user_with_a_user_id_of_another_congregation_is_not_found` | idem | idem |
| 8 | `test_assign_to_user_accepts_an_inactive_publisher` | idem | confirma que `is_active` nunca é checado |

O RED do ciclo 1 foi confirmado pela mensagem certa (`TypeError: TerritoryService.__init__() got
an unexpected keyword argument 'users'`) antes de tocar o construtor. Os ciclos 2–8 exercitam ramos
do mesmo método já implementado no GREEN do ciclo 1 — a lógica de `assign_to_user` é pequena e
coesa o bastante (uma leitura, uma checagem opcional, um repasse) para não valer a pena fatiar a
implementação por teste; cada um desses testes falharia se o ramo correspondente estivesse errado
(confirmado lendo o corpo do método contra cada caso), o que preserva a garantia de regressão que o
TDD busca mesmo sem um RED individual por ciclo.

## O que foi feito
- `TerritoryService.__init__` passou a receber `users: UserRepository`.
- Novo método `assign_to_user`, que busca o território pelo `get` já existente (reaproveitando o
  `NotFoundError` de "não existe ou não é desta congregação"), valida o publicador com o novo
  helper `_user_in_congregation` quando `user_id` não é `None`, e delega a escrita para
  `TerritoryRepository.set_assigned_user` (Task 04, já existente).
- Os dois pontos que instanciam `TerritoryService` (`admin_territories.py` e `app_client.py`)
  passaram a injetar `UserRepository(session)`.

## Arquivos modificados
- `server/app/services/territory.py` — `UserRepository` no construtor; método `assign_to_user` e o
  helper privado `_user_in_congregation`.
- `server/app/routers/admin_territories.py` — `get_territory_service` passa a instanciar e injetar
  `UserRepository(session)`.
- `server/app/routers/app_client.py` — idem.
- `server/tests/services/test_territory_service.py` — fixture `service` atualizada com `users=
  UserRepository(session)`; nova fixture `make_user` (cria publicador direto pelo repositório, com
  `is_active` opcional); oito testes novos cobrindo `assign_to_user`.

## Decisões técnicas
- **`_user_in_congregation` devolve `bool`, não o `User`.** O método não precisa do publicador
  carregado — só confirmar que ele existe e é da congregação certa — então devolver um booleano
  evita ter que importar o tipo `User` no serviço só para uma anotação.
- **`is_active` nunca é checado.** Documentado tanto na docstring do método quanto no teste — é a
  regra explícita do pedido: desativação revoga acesso ao app, não o direito de estar registrado
  como responsável por um território.
- **`make_user` é local ao arquivo de teste, não em `conftest.py`.** A instrução restringiu o
  escopo a `server/tests/services/test_territory_service.py`; como nenhum outro teste de serviço
  geométrico precisa criar um publicador direto contra o Postgres real, não há motivo para subir a
  fixture para o conftest compartilhado agora.
- **`UserRepository(session)` real, não fake.** A spec pediu explicitamente teste contra o Postgres
  real via a fixture `session`, seguindo o padrão do arquivo — os outros métodos de
  `TerritoryService` já são testados assim, e misturar um fake de usuário só neste método quebraria
  a consistência do arquivo sem ganho: criar um `User` pela `UserRepository` real é tão barato
  quanto a fake seria.
- **Falhas pré-existentes e fora de escopo.** A suíte completa do servidor reporta 4 falhas e 6
  erros em `tests/routers/test_app_client_routes.py` e em três suítes de
  `tests/integration/` — todos por `403 territory_not_assigned`. Confirmado que já existiam antes
  desta task (rodei a suíte com as mudanças desta task revertidas via `git stash` e o resultado foi
  o mesmo). A causa é a Task 06 da mesma spec (implementação 0081), que restringiu
  `WorkLogService.mark_worked` ao território designado sem atualizar os fixtures desses testes para
  designar um território antes de marcar uma quadra — isso é explicitamente coberto pelas Tasks
  08/09/11 da spec 0005, não pela Task 05. Nenhum dos arquivos com falha foi tocado por esta
  implementação.

## Como validar
```bash
cd server && uv run pytest tests/services/test_territory_service.py -v
cd server && uv run pytest tests/services/test_territory_service.py --cov=app.services.territory --cov-branch --cov-report=term-missing
```

## Resultado da validação
- `uv run pytest tests/services/test_territory_service.py`: **32 passed** (24 pré-existentes + 8
  novos).
- Cobertura de `app/services/territory.py`: **100% de linha e 100% de branch** (72 statements, 16
  branches, 0 perdidos).
- `uv run ruff check` e `uv run ruff format --check` nos quatro arquivos tocados: limpos.
- Suíte completa do servidor (`uv run pytest`): **459 passed**, com as mesmas 4 falhas / 6 erros
  pré-existentes descritos acima (confirmados idênticos antes desta task via `git stash`).
