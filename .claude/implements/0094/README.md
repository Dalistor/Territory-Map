# [0094] Integração: designação de território e marcação restrita, ponta a ponta

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0005/` — Task 11

## Solicitação

> Spec 0005 — Task 11: Crie `server/tests/integration/test_territory_assignment_integration.py`,
> seguindo exatamente o padrão dos outros arquivos em `server/tests/integration/` (app FastAPI real
> sobre o Postgres real, tudo criado por HTTP exceto a congregação). Cenários: o admin designa um
> publicador a um território e vê isso em `GET /admin/territories`; o publicador ativa o app e vê a
> mesma designação em `GET /app/territories`; ele marca uma quadra do território designado (201) e
> `GET /app/worked-territories` passa a listá-lo; um segundo publicador sem designação recebe 403
> `territory_not_assigned` ao tentar marcar, sem gerar log; o admin remove a designação e o primeiro
> publicador também passa a ser recusado no mesmo território.

## Contexto

As Tasks 05–10 da spec 0005 entregaram a designação de território (`assign_to_user`), a projeção
`assigned_user` em `GET /admin/territories` e `GET /app/territories`, `GET /app/worked-territories`
e o mapeamento de `TerritoryNotAssignedError` para 403 -- cada peça já coberta por teste de
unidade ou de rota isoladamente. Nenhum desses testes prova a junta: que o `user_id` que o admin
manda no `PATCH .../assignment` é o mesmo publicador cujo token o `mark_worked` mede depois, que a
mesma designação aparece nas duas leituras (admin e app), e que desfazer a designação fecha a porta
para quem acabara de ter acesso legítimo.

## Critérios de aceite

1. Admin cria território e publicador, designa via `PATCH /admin/territories/{id}/assignment`, e
   `GET /admin/territories` devolve `assigned_user` com o publicador certo.
2. O publicador ativa o app e `GET /app/territories` mostra o mesmo `assigned_user`.
3. O publicador marca uma quadra do território designado (`POST /app/blocks/{id}/worked`, 201), e
   `GET /app/worked-territories` passa a listar esse território com a data marcada.
4. Um segundo publicador, sem designação, recebe 403 `territory_not_assigned` ao tentar marcar
   qualquer quadra da congregação, e nenhum log é criado (histórico do bloco continua com 1 entrada).
5. O admin remove a designação (`user_id: null`); uma nova tentativa do primeiro publicador no
   mesmo território também recebe 403, e o histórico permanece com 1 entrada.

## Ciclos TDD

Diferente de uma mudança de regra de negócio nova, esta task testa a fiação entre camadas já
implementadas e testadas individualmente (Tasks 05/06/07/08/09/10) -- não há "vermelho" natural a
produzir escrevendo o teste primeiro, porque não há produção nova a fazer nascer. Segui o mesmo
tratamento que a implementação 0021 (a primeira leva de testes de integração do projeto) já deu a
esse caso: escrevi o fluxo completo, rodei e confirmei verde de primeira contra o código como está,
e then validei que o teste *falharia pelo motivo certo* com uma sonda descartável de
`unittest.mock.patch`, nunca tocando o arquivo de produção em disco.

| # | Caso de teste | Arquivo de teste | Verificação |
|---|---------------|------------------|--------------|
| 1 | `test_designation_gates_marking_end_to_end` (fluxo único, cenários 1-5 em sequência) | `server/tests/integration/test_territory_assignment_integration.py` | Passou de primeira contra o código real. Sonda: `patch("app.services.work_log.WorkLogService._refuse_unassigned_territory", lambda self, block, user: None)` em processo (nunca no arquivo em disco) fez a asserção `refused.status_code == 403` do segundo publicador falhar com `201 == 403` -- prova de que o teste de fato depende da regra, e não passaria com qualquer coisa. Sonda removida ao final do comando (nunca chegou a existir em disco). |

## O que foi feito

Criado um único teste de fluxo longo (mesmo raciocínio de `test_full_flow_integration.py`: os
cinco cenários pedidos formam uma sequência causal -- assign → leitura pelo admin → leitura pelo
app → marcação com sucesso → recusa de outro publicador → recusa depois de desdesignar -- e
separá-los em testes distintos exigiria repetir os quatro passos anteriores como setup de cada um,
escondendo justamente o que vale a pena provar: que eles encadeiam).

Como `PATCH /admin/territories/{id}/assignment` e `GET /app/worked-territories` ainda não tinham
wrapper na fachada `Api` de `conftest.py` (ela cobre as rotas usadas pelos cinco arquivos
anteriores, criados antes da spec 0005), o teste novo chama essas duas rotas diretamente via
`api.client` (campo público do dataclass `Api`) com um `bearer()` local -- sem modificar
`conftest.py`, conforme a instrução de tocar somente o arquivo de teste novo.

**Nenhum bug de fiação encontrado.** As Tasks 08, 09 e 10 já estavam corretamente conectadas:
`territory_out()` em ambos os routers já monta `assigned_user`, a rota de designação já persiste e
recarrega a relação, e `TerritoryNotAssignedError` já responde 403 com `code ==
"territory_not_assigned"`. Não foi necessário tocar nenhum arquivo de produção.

## Arquivos modificados

Nenhum arquivo de produção. Nenhum outro arquivo de teste.

## Arquivos criados

- `server/tests/integration/test_territory_assignment_integration.py` -- o fluxo completo descrito
  acima.

## Decisões técnicas

- **Um teste, não cinco.** Mesma decisão e mesmo motivo já registrados em `implements/0021` para
  `test_full_flow_integration.py`: os cenários são uma cadeia, não casos independentes.
- **Chamadas diretas via `api.client` para as duas rotas novas, em vez de estender `Api`.** A
  instrução da task restringe a mudança ao arquivo de teste novo. Como essas duas rotas não têm
  wrapper ainda, e adicioná-lo pertenceria a `conftest.py` (compartilhado por seis arquivos), optei
  por dois helpers locais (`assign_territory`, `worked_territories`) que usam o campo público
  `api.client` e um `bearer()` duplicado do de `conftest.py` -- duplicação mínima e deliberada para
  não tocar infraestrutura compartilhada fora do escopo pedido. Se uma próxima task de integração
  precisar das mesmas rotas, vale promover esses dois helpers para `Api` em `conftest.py`.
- **RED substituído por sonda descartável.** Regra geral 2 ("nunca pule o RED") pressupõe produção
  ainda não escrita; aqui a produção já existe e já passou por TDD nas Tasks 05/06. Segui o
  precedente do projeto (`implements/0021`): usei `unittest.mock.patch` num processo Python
  descartável para desligar `_refuse_unassigned_territory` e confirmar que a asserção de 403
  realmente falha (`201 == 403`) sem a regra -- ou seja, o teste não passaria com qualquer coisa.
  O arquivo de produção nunca foi editado em disco.
- **Fora do escopo, não corrigido:** a suíte completa do servidor, antes e depois desta task, tem
  as mesmas 4 falhas em `tests/routers/test_app_client_routes.py` (2 testes) e
  `tests/integration/test_device_swap_integration.py` (1) e `test_full_flow_integration.py` (1), e
  os mesmos 6 erros, todos em `tests/integration/test_revocation_integration.py` -- pré-existentes
  desde a Task 06 (implementação 0081), porque esses arquivos marcam quadra sem designar território
  primeiro. A instrução desta task foi explícita em não consertá-los; ver "Resultado da validação".

## Como validar

```bash
cd server
uv run pytest tests/integration/test_territory_assignment_integration.py -q
uv run pytest -q   # suíte completa, para comparar com o baseline documentado abaixo
uv run ruff check tests/integration/test_territory_assignment_integration.py
uv run ruff format --check tests/integration/test_territory_assignment_integration.py
```

## Resultado da validação

- `pytest tests/integration/test_territory_assignment_integration.py -q` → **1 passed**.
- `ruff check` e `ruff format --check` → limpos.
- Baseline da suíte completa **antes** desta task (`uv run pytest -q`): **4 failed, 459 passed, 6
  errors** --
  `tests/integration/test_device_swap_integration.py::test_redeeming_on_a_new_phone_takes_the_access_away_from_the_old_one`,
  `tests/integration/test_full_flow_integration.py::test_a_congregation_goes_from_empty_to_a_worked_block`,
  `tests/routers/test_app_client_routes.py::test_marking_a_block_creates_the_log_and_the_next_read_shows_it`,
  `tests/routers/test_app_client_routes.py::test_resending_the_same_log_id_answers_200_and_stores_nothing_new`
  falhando; os 6 erros são todos em `tests/integration/test_revocation_integration.py`.
- Suíte completa **depois** desta task (`uv run pytest -q`): **4 failed, 460 passed, 6 errors** --
  exatamente o mesmo conjunto de falhas/erros de antes, mais o teste novo passando. Nenhuma
  regressão, nenhuma correção incidental.
- Cobertura: não aplicável -- nenhuma linha de produção foi criada ou alterada por esta task.

**Nota para quem for tratar o fallout pré-existente:** os 4 failed + 6 errors acima continuam sendo
os mesmos documentados em `implements/0081` (Task 06) e confirmados de novo aqui após a Task 11
estar concluída -- ou seja, concluir a Task 11 não os resolve sozinha, porque eles vivem em
arquivos de teste diferentes (`test_app_client_routes.py`, `test_device_swap_integration.py`,
`test_full_flow_integration.py`, `test_revocation_integration.py`) que precisam ser atualizados
para designar o território antes de marcar -- trabalho fora do escopo desta task, deixado para o
orquestrador decidir.
