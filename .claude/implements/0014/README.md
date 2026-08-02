# [0014] Service de território

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 13

## Solicitação

> Spec 0001 — Task 13: Implemente por TDD `server/app/services/territory.py` com
> `TerritoryService` (recebe `TerritoryRepository`, `BlockRepository` e `now_provider`).
> Métodos `create`, `get`, `list`, `update`, `delete`, todos escopados por `congregation_id`.
> Os testes deste service rodam contra **PostGIS real** (fixture do banco de teste), porque os
> predicados são do banco — não mocke geometria. […] Toque apenas em `app/services/territory.py`
> e `tests/services/test_territory_service.py`.

## Contexto

A demarcação do território é a regra mais delicada do sistema: ela decide o que o admin consegue
desenhar no mapa. Três predicados do PostGIS sustentam tudo — `ST_Intersects`, `ST_Touches` e
`ST_Within` — e o valor deles está justamente nas bordas: dois territórios vizinhos **devem**
compartilhar a divisa, e uma quadra desenhada exatamente sobre o contorno **está** dentro dele.
Por isso o teste é contra PostGIS real: um dublê de `ST_Touches` acerta o caso fácil e erra
exatamente onde o bug mora.

O service é a camada que traduz a resposta do banco em decisão de negócio e em mensagem que o
admin consegue agir — nomeadamente, dizer **quais quadras** ficaram fora quando ele encolhe uma
demarcação.

## Critérios de aceite

- (a) Criar território com polígono válido persiste e devolve os pontos na ordem em que entraram
- (b) Polígono com menos de 3 pontos, ou com auto-interseção, levanta `InvalidPolygonError`
- (c) Criar território que se sobrepõe a outro da mesma congregação levanta `TerritoryOverlapError`
- (d) Criar território que apenas encosta na divisa de outro é aceito
- (e) Território de outra congregação com a mesma área não bloqueia
- (f) Nome repetido na mesma congregação levanta `DuplicateNameError`; em congregação diferente é aceito
- (g) Atualizar a demarcação não conflita com o próprio território
- (h) Atualizar deixando quadras fora levanta `BlockOutsideTerritoryError` listando os números
- (i) A mesma atualização é aceita quando todas as quadras continuam dentro
- (j) `get`/`update`/`delete` de território de outra congregação levantam `NotFoundError`
- (k) Apagar território apaga suas quadras em cascata

## Ciclos TDD

24 testes, todos contra PostGIS real. Cada linha abaixo é um ciclo red-green-refactor.

| # | Caso de teste | Critério | Código que passou a existir |
|---|---------------|----------|------------------------------|
| 1 | `create_stores_the_territory_and_gives_the_points_back_in_order` | a | `create` + `boundary_points` |
| 2 | `create_with_fewer_than_three_points_is_refused` | b | `validate_polygon` no `create` |
| 3 | `create_with_a_self_crossing_ring_is_refused` | b | (mesmo ciclo) |
| 4 | `create_invading_another_territory_of_the_congregation_is_refused` | c | `_refuse_overlap` |
| 5 | `create_touching_the_border_of_another_territory_is_accepted` | d | guarda do predicado |
| 6 | `create_over_the_same_area_of_another_congregation_is_accepted` | e | guarda do escopo |
| 7 | `create_with_a_name_already_used_in_the_congregation_is_refused` | f | `_refuse_duplicate_name` |
| 8 | `create_with_a_name_used_by_another_congregation_is_accepted` | f | guarda do escopo |
| 9 | `get_returns_the_territory_of_the_congregation` | — | `get` |
| 10 | `get_of_a_territory_of_another_congregation_is_not_found` | j | `NotFoundError` no `get` |
| 11 | `list_returns_only_the_territories_of_the_congregation` | — | `list` |
| 12 | `update_renames_the_territory` | — | `update` (nome) |
| 13 | `update_of_a_territory_of_another_congregation_is_not_found` | j | guarda: `update` passa pelo `get` |
| 14 | `update_redraws_the_boundary_without_the_territory_colliding_with_itself` | g | `exclude_id` na checagem |
| 15 | `update_that_invades_a_neighbouring_territory_is_refused` | — | guarda do `_refuse_overlap` |
| 16 | `update_with_a_self_crossing_ring_is_refused` | b | guarda do `validate_polygon` |
| 17 | `update_to_a_name_already_used_in_the_congregation_is_refused` | f | duplicidade no `update` |
| 18 | `update_that_keeps_the_territorys_own_name_is_accepted` | — | `name != territory.name` |
| 19 | `update_that_leaves_blocks_outside_is_refused_naming_their_numbers` | h | `_refuse_orphaned_blocks` |
| 20 | `update_that_leaves_a_single_block_outside_says_so_in_the_singular` | h | ramo singular da mensagem |
| 21 | `update_that_keeps_every_block_inside_is_accepted` | i | guarda do mesmo método |
| 22 | `delete_removes_the_territory` | — | `delete` |
| 23 | `delete_takes_the_blocks_of_the_territory_with_it` | k | cascata do schema |
| 24 | `delete_of_a_territory_of_another_congregation_is_not_found` | j | guarda: `delete` passa pelo `get` |

## O que foi feito

`TerritoryService` com `create`, `get`, `list`, `update`, `delete` e `boundary_points`, todos
escopados por `congregation_id`. Três guardas privadas concentram as regras: `_refuse_duplicate_name`,
`_refuse_overlap` e `_refuse_orphaned_blocks`. Nenhum predicado geométrico é avaliado em Python —
o service monta o WKT e pergunta ao repositório, que pergunta ao PostGIS.

Junto veio a infraestrutura de teste com banco real, que ainda não existia (ver Decisões técnicas).

## Arquivos criados

- `server/app/services/territory.py` — as regras de negócio do território
- `server/tests/services/test_territory_service.py` — 24 testes contra PostGIS real
- `server/tests/conftest.py` — engine no banco de teste, transação por teste, fábrica de congregação

## Decisões técnicas

**`tests/conftest.py` foi criado fora do escopo declarado da task.** A task manda testar contra
PostGIS real, e nenhuma task anterior tinha criado a fixture de banco — as Tasks 11 e 12 usam
repositórios fake e não precisavam dela. Sem esse arquivo a task era impossível de cumprir. Ele
contém só encanamento (engine, transação, fábrica de congregação), nada de regra de negócio, e as
Tasks 14, 15 e 21 vão reusá-lo.

**O conftest aponta o processo inteiro para `TEST_DATABASE_URL`.** `app.core.db` cria o engine no
import e o `env.py` do Alembic lê `DATABASE_URL`; sobrescrever a variável uma vez, no topo do
conftest, é o que garante que nenhum teste escreva no banco de desenvolvimento. Efeito colateral
bem-vindo: `tests/core/test_deps.py`, que importa `get_session`, deixou de tocar o banco de dev.

**Cada teste roda em transação com rollback**, com a sessão em `join_transaction_mode="create_savepoint"`
— assim o código sob teste pode dar `commit` sem que nada sobre. Verificado: as tabelas ficam
vazias depois da suíte, e vários testes criam a congregação "Central"/"São Paulo", que tem único
composto — se o rollback falhasse, o segundo teste quebraria na hora.

**Os testes (d) e (e) passam sem alterar o código, e isso é intencional.** São guardas contra
*excesso* de rejeição, que é o erro fácil aqui. Para confirmar que não são vazios, o predicado foi
temporariamente trocado por um `ST_Intersects` ingênuo sem filtro de congregação: os dois testes
falharam, e voltaram a passar com o predicado correto. O mesmo vale para os testes 13, 15, 16, 21
e 24, que fixam ramos já implementados.

**A checagem de nome vem antes da de sobreposição** no `create`. As duas são independentes; a de
nome é uma consulta por índice B-tree e a mensagem é a mais acionável das duas.

**A duplicidade de nome é consultada antes de inserir**, apesar do único composto no banco. Uma
violação de constraint chega como `IntegrityError`, envenena a transação e não diz nada que o admin
possa fazer. O banco continua sendo a rede de segurança.

**`update` só compara o nome quando ele muda de fato.** Um PATCH que reenvia o nome atual junto com
uma nova demarcação é o caso comum na tela do admin, e não pode parecer um conflito.

**A mensagem de `BlockOutsideTerritoryError` é construída no service, com singular e plural
separados**, porque ela cita dados da situação ("A quadra 12 ficou fora…", "As quadras 12 e 30
ficaram fora…"). O `default_message` da exceção continua servindo quem não tem os números.

**`create`/`update` devolvem o model `Territory`, não um DTO.** Quem monta `TerritoryOut` é o router
(Task 18); para isso ele chama `boundary_points`, que é onde o WKT e a ordem `(lng, lat)` param.
Nenhuma camada acima do service manipula geometria.

**`now_provider` é recebido e guardado sem uso.** `created_at` é carimbado pelo banco, então o
território ainda não precisa do relógio. A dependência está no construtor porque a spec a define
assim e porque os routers montam todos os services do mesmo jeito — e para que qualquer regra
futura leia o relógio injetado em vez de `datetime.now()`.

**`from __future__ import annotations` no módulo**: o método `list` sombreia o builtin dentro do
corpo da classe, e sem anotações adiadas `list[Territory]` tenta indexar o próprio método.

**As quadras dos testes são criadas pelo `BlockRepository`, não pelo `BlockService`** — este último
é a Task 14, e depender dele faria estes testes falharem por motivo alheio ao território.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d      # PostGIS precisa estar de pé
cd server
uv run pytest tests/services/test_territory_service.py -q
uv run pytest --cov=app --cov-branch --cov-report=term-missing -q
uv run ruff check . && uv run ruff format --check .
```

## Resultado da validação

- `uv run pytest tests/services/test_territory_service.py -q` → **24 passed**
- `uv run pytest --cov=app --cov-branch -q` → **245 passed** (suíte inteira, nada regrediu)
- Cobertura de `app/services/territory.py`: **62 statements, 0 missing; 14 branches, 0 partial —
  100% de linha e de branch**
- Todos os services do projeto em 100%: `auth.py`, `user.py`, `territory.py`
- `ruff check .` → All checks passed · `ruff format --check .` → 48 files already formatted
- Banco de teste sem resíduo depois da suíte (0 linhas em `congregations`, `territories`, `blocks`)
  e banco de desenvolvimento intocado
