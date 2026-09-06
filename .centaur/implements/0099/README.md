# [0099] Conserto avulso: testes pré-existentes quebrados pela restrição de designação

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** decorrente da [0005](../../specs/0005/README.md), mas não é uma task dela — conserto
avulso pedido diretamente pelo usuário depois que a spec fechou com essa pendência conhecida.

## Solicitação

"Conserte os testes pré-existentes do servidor que ficaram quebrados pela nova regra de negócio
da spec 0005" — `WorkLogService.mark_worked` (Task 06, implementação 0081) passou a rejeitar com
`TerritoryNotAssignedError` (403, `territory_not_assigned`) qualquer marcação cujo território não
esteja designado ao publicador. Quatro arquivos de teste pré-existentes marcavam quadra sem nunca
designar território a ninguém, e nenhuma das 27 tasks da spec 0005 tinha escopo para tocá-los
(a Task 11 só criou um teste de integração novo).

## Contexto

Ao final da spec 0005, `cd server && uv run pytest` reprovava com 4 falhas + 6 erros:
- `tests/routers/test_app_client_routes.py` (2 falhas)
- `tests/integration/test_full_flow_integration.py` (1 falha)
- `tests/integration/test_device_swap_integration.py` (1 falha)
- `tests/integration/test_revocation_integration.py` (6 erros — todas as seis funções dependem da
  fixture `worked_block`, que falhava)

A CI do servidor (`.github/workflows/server.yml`) roda a suíte inteira e falha se `app/services/`
sair de 100% de cobertura — este conserto era bloqueante para qualquer deploy futuro que tocasse o
servidor.

## Critérios de aceite

- Nenhuma regra de negócio muda — o objetivo de cada teste continua o mesmo.
- O publicador que marca a quadra, em cada teste, passa a ter o território designado antes de
  marcar (a única mudança de setup necessária).
- A suíte completa fica 100% verde, sem perder cobertura em `app/services/`.

## O que foi feito

Nenhuma linha de `app/` foi tocada — a correção é inteiramente do lado dos testes, porque não
faltava comportamento novo, faltava setup (a designação) para o comportamento já existente e já
testado (Tasks 05/06/11 da spec 0005).

1. **`tests/routers/test_app_client_routes.py`** — nova fixture `assign_territory`, no mesmo
   estilo de `draw` (via `TerritoryRepository`, não HTTP, porque este arquivo é sobre as duas
   rotas do app, não sobre a rota de designação do admin). Aplicada nos dois testes que marcam
   quadra esperando sucesso: `test_marking_a_block_creates_the_log_and_the_next_read_shows_it` e
   `test_resending_the_same_log_id_answers_200_and_stores_nothing_new`.
2. **`tests/integration/conftest.py`** — novo método `Api.assign_territory(admin_token,
   territory_id, user_id)`, chamando `PATCH /admin/territories/{id}/assignment` (a rota real da
   Task 08), no mesmo padrão dos outros métodos da classe `Api`. Compartilhado pelos três arquivos
   de integração abaixo.
3. **`tests/integration/test_full_flow_integration.py`** — inserido um passo "o admin designa o
   território ao publicador" entre o momento em que o telefone lê o mapa com as quadras e o
   momento em que marca a primeira — é onde a narrativa do fluxo completo pede isso.
4. **`tests/integration/test_device_swap_integration.py`** — designação adicionada logo após
   desenhar a quadra, porque o teste marca com o token antigo e depois com o novo, e ambos
   pertencem ao mesmo publicador (a troca de aparelho não desfaz a designação).
5. **`tests/integration/test_revocation_integration.py`** — designação adicionada na fixture
   compartilhada `worked_block`, usada pelas seis funções de teste do arquivo (incluindo
   `test_reactivating_gives_the_same_device_its_access_back`, que marca de novo depois de
   reativar — a designação nunca é removida nesse fluxo, então continua valendo).

Nenhum teste precisou verificar especificamente "publicador sem território designado" além do que
a Task 06 (`test_work_log_service.py`) e a Task 11
(`test_territory_assignment_integration.py`) já cobrem — não foi necessário ajustar nenhuma
expectativa de status code além de corrigir o setup.

## Arquivos modificados

- `server/tests/routers/test_app_client_routes.py` — fixture `assign_territory` nova; dois testes
  passaram a designar o território antes de marcar.
- `server/tests/integration/conftest.py` — método `Api.assign_territory` novo.
- `server/tests/integration/test_full_flow_integration.py` — passo de designação inserido no
  fluxo.
- `server/tests/integration/test_device_swap_integration.py` — designação após desenhar a quadra.
- `server/tests/integration/test_revocation_integration.py` — designação na fixture
  `worked_block`.

## Decisões técnicas

- **Via repositório em `test_app_client_routes.py`, via HTTP nos testes de integração.** Cada
  arquivo manteve a convenção que já usava para montar o cenário (`draw` é repositório; `Api` é
  HTTP de ponta a ponta) — misturar as duas dentro do mesmo arquivo teria sido inconsistente com o
  propósito documentado de cada camada de teste.
- **Nenhuma asserção foi enfraquecida.** Todas as asserções originais permanecem; a única mudança
  é setup adicional antes da ação sob teste.
- **`assign_territory` virou método de `Api`, não uma chamada inline repetida.** A Task 11 (spec
  0005) tinha feito uma chamada ad hoc via `api.client` direto para não tocar `conftest.py` (fora
  do escopo dela); como este conserto já precisava editar três arquivos de integração, valeu a
  pena promover isso a um método compartilhado — menos repetição e mais alinhado ao estilo da
  classe `Api`.

## Como validar

```bash
cd server
uv run pytest -q
uv run pytest --cov=app --cov-report=term-missing -q
uv run ruff check tests/routers/test_app_client_routes.py tests/integration/
uv run ruff format --check tests/routers/test_app_client_routes.py tests/integration/
```

## Resultado da validação

- `uv run pytest -q` → **470 passed**, 0 falhas, 0 erros (era 460 passed / 4 failed / 6 errors).
- `uv run pytest --cov=app --cov-report=term-missing -q` → `app/services/` em **100%** em todos os
  módulos (auth, block, congregation, territory, user, work_log); total do projeto 95% (as linhas
  descobertas são `app/core/db.py` e `app/jobs/create_congregation.py`, pré-existentes e fora do
  escopo deste conserto).
- `ruff check` e `ruff format --check` nos cinco arquivos tocados → limpos.
