# [0143] Teste de integração: rotação e marcação pelo admin ponta a ponta (spec 0009, Task 06)

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0009/` — Task 06

## Solicitação
> Spec 0009 — Task 06: escreva `server/tests/integration/test_admin_marking_integration.py`, seguindo o padrão dos arquivos vizinhos em `server/tests/integration/` (app FastAPI real sobre PostGIS real, tudo criado por HTTP, congregação como única linha escrita direto no banco).
>
> Cubra dois fluxos ponta a ponta. **Um:** admin cria território e quadra, cadastra dois publicadores, marca a quadra como trabalhada em nome do primeiro, e confirma que `GET /admin/blocks/{id}/work-logs` nomeia esse publicador e que o `last_worked_at` da quadra aparece atualizado tanto no `GET` do território do admin quanto no `GET /app/territories` lido com o token do segundo publicador — inclusive quando **nenhuma designação** existe no território, que é a diferença central em relação à regra do app. Confirme também, no mesmo teste, que o app do segundo publicador continua tomando 403 `territory_not_assigned` ao tentar marcar a mesma quadra: a rota nova é do admin e não afrouxa nada do lado do celular. **Dois:** admin define `rotation_days` no território via `PATCH`, e o valor volta em `GET /admin/territories` e em `GET /app/territories`; depois manda um `PATCH` só com o nome e confirma que a rotação sobreviveu; por fim manda `rotation_days: null` e confirma que voltou ao nulo. Verifique que o isolamento entre congregações se mantém: o admin de outra congregação recebe 404 ao tentar marcar essa quadra ou alterar essa rotação.
>
> Toque apenas em `server/tests/integration/`; não modifique código de produção — se algum comportamento não fechar, o defeito é de uma task anterior e deve ser reportado, não corrigido aqui.

## Contexto
As Tasks 01–05 da spec 0009 entregaram, camada por camada, a coluna `Territory.rotation_days`,
os DTOs, o `TerritoryService.update` com sentinela `UNSET`, o `WorkLogService.mark_worked_by_admin`
e as duas rotas HTTP. Cada uma tem teste na sua camada, e nenhuma delas prova a junta.

Três coisas só são observáveis ponta a ponta:

1. Um `BlockWorkLog` criado pelo admin é indistinguível de um criado pelo celular depois que
   aterrissa — mesmo `GET /admin/blocks/{id}/work-logs`, mesma projeção `last_worked_at`, e a
   mudança aparece nos dois mapas (admin e app), que são serializadores diferentes.
2. O admin **não** é barrado pela designação, e o app **continua** sendo. A divergência entre as
   duas regras é o ponto central da spec, e ela só existe de verdade quando as duas rotas são
   chamadas contra o mesmo bloco.
3. "Chave ausente" e "chave nula" em `rotation_days` são distinguidos por `model_fields_set`, uma
   distinção que deixa de existir no momento em que atravessa um fio — então vale conferir do
   outro lado dele.

## Critérios de aceite
- Admin marca quadra de território **sem nenhuma designação** e recebe 201 com o publicador nomeado.
- `GET /admin/blocks/{id}/work-logs` traz o log com o nome do publicador e o `worked_at` enviado.
- `last_worked_at` atualizado aparece no `GET /admin/territories/{id}` e no `GET /app/territories`
  lido com o token do **segundo** publicador (que não marcou nada).
- O segundo publicador, pelo app, toma **403 `territory_not_assigned`** na mesma quadra, e a
  recusa não grava nada.
- `PATCH {"rotation_days": 30}` responde 200 com 30, e o número volta em `GET /admin/territories`
  e em `GET /app/territories`.
- `PATCH {"name": "..."}` **preserva** a rotação de 30 dias.
- `PATCH {"rotation_days": null}` volta ao nulo, e o nome sobrevive à edição de rotação.
- `PATCH {"rotation_days": 0}` responde 422.
- Admin de outra congregação recebe **404 `not_found`** ao marcar a quadra — tanto nomeando um
  publicador dela quanto nomeando o publicador da congregação dona da quadra — e ao alterar a
  rotação do território alheio; o território permanece intacto.

## Ciclos TDD
Esta task é o fecho de uma spec: as Tasks 01–05 já estavam concluídas, então o código de produção
que os testes exigem **já existia** e o RED natural não era alcançável — escrever produção aqui
era, aliás, explicitamente proibido pela instrução da task.

Para não trocar TDD por "escrevi asserção e ela passou", cada caso foi validado por **mutação
temporária** do código de produção (revertida em seguida, com `diff` provando a restauração byte a
byte). A mutação de referência, registrada abaixo, é a mais sutil e a que mais facilmente seria
desfeita por um leitor futuro.

| # | Caso de teste | Arquivo de teste | Verificação |
|---|---------------|------------------|-------------|
| 1 | `test_the_admin_marks_a_block_for_a_publisher_who_was_never_assigned_to_it` | `server/tests/integration/test_admin_marking_integration.py` | Verde contra o código das Tasks 04/05 |
| 2 | `test_the_admin_sets_a_rotation_cycle_and_it_survives_an_unrelated_edit` | idem | Fica **vermelho** ao trocar o `UNSET` de `patch_territory` por `payload.rotation_days` direto — prova que a asserção de "renomear não zera a rotação" morde |
| 3 | `test_neither_the_marking_nor_the_rotation_reaches_across_congregations` | idem | O mesmo helper que devolve 404 aqui devolve 201 no teste 1, o que descarta o falso positivo de um 404 vindo de rota inexistente |

## O que foi feito
Escrito um único arquivo novo de teste de integração com três testes, seguindo as fixtures e o
estilo narrativo dos vizinhos (`api`, `register_congregation`, `square` do
`tests/integration/conftest.py`; app FastAPI real por `httpx.ASGITransport` sobre o PostGIS real;
uma transação por requisição). Nenhuma linha de produção foi tocada.

## Arquivos modificados
Nenhum.

## Arquivos criados
- `server/tests/integration/test_admin_marking_integration.py` — os três fluxos ponta a ponta da
  marcação feita pelo admin e da rotação por território.

## Decisões técnicas
- **Dois helpers locais (`admin_mark_worked`, `patch_territory`) em vez de estender o `Api` do
  `conftest.py`.** É a decisão que o `test_territory_assignment_integration.py` já tomou para
  `GET /app/worked-territories`, e o comentário lá explica o porquê: um arquivo de fluxo não
  precisa alterar a fachada compartilhada para exercer uma rota que só ele usa. `bearer` é
  duplicado pelo mesmo motivo, com o comentário apontando para a origem.
- **`patch_territory` recebe o corpo cru, não argumentos nomeados.** O comportamento sob teste é
  justamente a diferença entre "a chave não veio" e "a chave veio nula"; uma assinatura com
  defaults apagaria essa diferença antes de a requisição ser montada, e o teste passaria a
  provar o helper.
- **Um teste longo por fluxo, não um teste por asserção.** Mesma razão declarada nos vizinhos: os
  passos são uma sequência (marcar → ler o histórico → ler os dois mapas → ser recusado pelo app),
  e quebrá-los transformaria as asserções anteriores em setup das seguintes, escondendo o
  encadeamento — que é a única coisa que este nível de teste acrescenta aos testes de camada.
- **No teste de isolamento, o admin alheio tenta marcar duas vezes: com o publicador dele e com o
  meu.** A segunda é a recusa interessante — a quadra e a pessoa existem, só não são dele — e é
  onde um 403 no lugar do 404 revelaria qual metade do par existe.
- **Cobertura não foi medida para esta task.** Ela não acrescenta linha de produção; o portão de
  100% em `app/services/` é responsabilidade das Tasks 03 e 04, e continua verde na suíte completa.

## Como validar
```bash
docker compose -f docker-compose.dev.yml up -d
cd server && uv run pytest tests/integration/test_admin_marking_integration.py -q
```

## Resultado da validação
- `uv run pytest tests/integration/test_admin_marking_integration.py -q` → **3 passed**
- `uv run pytest tests/integration/ -q` → **31 passed**
- `uv run pytest -q` (suíte completa do servidor) → **561 passed**
- `uv run ruff check tests/integration/` → All checks passed
- `uv run ruff format --check tests/integration/test_admin_marking_integration.py` → already formatted
- Mutação de controle no `patch_territory` (trocar `UNSET` por `payload.rotation_days`) →
  1 failed, 2 passed; produção restaurada e conferida com `diff` (idêntica).
- `git status` confirma que o único arquivo novo do servidor é o de teste; nenhum arquivo de
  produção foi modificado por esta task.
