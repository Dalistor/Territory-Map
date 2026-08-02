# [0016] Service de quadra

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 14

## Solicitação

> Spec 0001 — Task 14: Implemente por TDD `server/app/services/block.py` com `BlockService`
> (recebe `BlockRepository`, `TerritoryRepository`, `now_provider`), rodando contra PostGIS real.
> Métodos `create`, `list`, `update`, `delete`, escopados por `congregation_id` através do
> território. […] Toque apenas em `app/services/block.py` e
> `tests/services/test_block_service.py`.

## Contexto

A quadra é a unidade real de trabalho em campo — é ela que o publicador marca como trabalhada e
é ela que o mapa destaca. Três regras a governam, e todas as três vivem em bordas onde é fácil
errar por excesso de rigor:

- **Contenção**: a quadra tem de estar inteiramente dentro do território (`ST_Within`), mas
  `ST_Within` **inclui a borda** — uma quadra desenhada exatamente sobre o contorno do território
  está dentro dele. Um único vértice fora já invalida.
- **Sobreposição**: quadras vizinhas **devem** compartilhar a rua entre elas, então só conta
  colisão de interiores (`ST_Intersects AND NOT ST_Touches`).
- **Numeração**: vem do mapa em papel que a congregação já usa, então chega fora de ordem e com
  buracos. O servidor sugere o **menor inteiro ≥1 livre**, e o admin pode sobrescrever.

O service é a camada que traduz a resposta do PostGIS em decisão de negócio, e que amarra o
escopo multi-tenant: uma quadra não tem congregação própria, ela herda a do território.

## Critérios de aceite

- (a) Criar quadra inteiramente dentro do território persiste e recebe o número sugerido quando
  `number` não é informado
- (b) A numeração automática é o menor inteiro ≥1 livre — com 1, 2 e 4 existentes, a próxima é 3
- (c) `number` informado pelo admin é respeitado, inclusive fora de sequência
- (d) `number` repetido no mesmo território levanta `DuplicateBlockNumberError`; o mesmo número em
  outro território é aceito
- (e) Quadra com um único vértice fora do contorno levanta `BlockOutsideTerritoryError`
- (f) Quadra que coincide exatamente com o contorno do território é aceita
- (g) Quadra sobrepondo outra do mesmo território levanta `BlockOverlapError`
- (h) Quadra que apenas encosta em outra é aceita
- (i) Polígono inválido levanta `InvalidPolygonError`
- (j) Criar quadra em território de outra congregação levanta `NotFoundError`
- (k) Atualizar o polígono de uma quadra não a compara consigo mesma
- (l) `last_worked_at` de uma quadra recém-criada é `None`

## Ciclos TDD

26 testes, todos contra PostGIS real. Cada linha é um ciclo red-green-refactor.

| # | Caso de teste | Critério | Código que passou a existir |
|---|---------------|----------|------------------------------|
| 1 | `create_stores_the_block_and_gives_the_points_back_in_order` | a | `create` + `polygon_points` |
| 2 | `create_without_a_number_takes_the_first_one_of_the_territory` | a | (número ainda fixo em 1) |
| 3 | `create_without_a_number_fills_the_first_gap_in_the_numbering` | b | `next_free_number` no `create` |
| 4 | `create_with_a_number_chosen_by_the_admin_keeps_it_even_out_of_sequence` | c | ramo do número informado |
| 5 | `create_with_a_number_already_used_in_the_territory_is_refused` | d | `_refuse_duplicate_number` |
| 6 | `create_with_a_number_used_in_another_territory_is_accepted` | d | guarda do escopo |
| 7 | `create_with_a_single_vertex_outside_the_territory_is_refused` | e | `_refuse_outside_territory` |
| 8 | `create_matching_the_territory_outline_exactly_is_accepted` | f | guarda da borda do `ST_Within` |
| 9 | `create_invading_another_block_of_the_territory_is_refused` | g | `_refuse_overlap` |
| 10 | `create_touching_another_block_is_accepted` | h | guarda do `NOT ST_Touches` |
| 11 | `create_with_a_self_crossing_ring_is_refused` | i | `validate_polygon` no `create` |
| 12 | `create_with_fewer_than_three_points_is_refused` | i | guarda do mesmo ponto |
| 13 | `create_in_a_territory_of_another_congregation_is_not_found` | j | `_require_territory` |
| 14 | `create_leaves_the_block_never_worked` | l | guarda do estado inicial |
| 15 | `list_returns_the_blocks_of_the_territory_in_numeric_order` | — | `list` |
| 16 | `list_of_a_territory_of_another_congregation_is_not_found` | j | guarda: `list` passa pelo `_require_territory` |
| 17 | `update_renumbers_the_block` | — | `update` + `_require_block` |
| 18 | `update_redraws_the_block_without_it_colliding_with_itself` | k | redesenho + `exclude_id` |
| 19 | `update_that_moves_the_block_outside_the_territory_is_refused` | e | contenção no `update` |
| 20 | `update_that_invades_another_block_is_refused` | g | sobreposição no `update` |
| 21 | `update_to_a_number_already_used_in_the_territory_is_refused` | d | duplicidade no `update` |
| 22 | `update_that_keeps_the_blocks_own_number_is_accepted` | — | `number != block.number` |
| 23 | `update_with_a_self_crossing_ring_is_refused` | i | `validate_polygon` no `update` |
| 24 | `update_of_a_block_of_another_congregation_is_not_found` | j | guarda: `update` passa pelo `_require_block` |
| 25 | `delete_removes_the_block` | — | `delete` |
| 26 | `delete_of_a_block_of_another_congregation_is_not_found` | j | guarda do mesmo caminho |

## O que foi feito

`BlockService` com `create`, `list`, `update`, `delete` e `polygon_points`. Duas guardas de escopo
(`_require_territory`, `_require_block`) e três de regra (`_refuse_duplicate_number`,
`_refuse_outside_territory`, `_refuse_overlap`). Nenhum predicado geométrico é avaliado em Python:
o service monta o WKT e pergunta ao repositório, que pergunta ao PostGIS.

## Arquivos criados

- `server/app/services/block.py` — as regras de negócio da quadra
- `server/tests/services/test_block_service.py` — 26 testes contra PostGIS real

## Decisões técnicas

**O escopo multi-tenant entra por dois caminhos diferentes, de propósito.** `create` e `list`
recebem o `territory_id` da URL e resolvem o território (`TerritoryRepository.get`, que já filtra
por congregação); `update` e `delete` recebem o `block_id` e resolvem a quadra
(`BlockRepository.get_in_congregation`, que faz o join com `territories`). Nos dois casos o filtro
está **dentro da consulta**, nunca conferido depois — um recurso de outra congregação nunca chega a
ser carregado. O teste 13 pegou exatamente essa falha: antes do `_require_territory`, o service
gravava uma quadra dentro do território de outra congregação sem reclamar.

**Ordem das checagens no `create`: território → polígono → número → contenção → sobreposição.**
A congregação vem primeiro porque um recurso de outro tenant não deve nem ser avaliado. O polígono
vem antes das consultas geométricas porque `validate_polygon` é Shapely puro e não abre conexão —
e porque um anel inválido faria o PostGIS falhar com erro de banco em vez de erro de domínio.
O número vem antes da geometria pela mesma razão da Task 13: é uma consulta por índice B-tree e a
mensagem é a mais fácil de agir.

**A duplicidade de número é consultada antes de inserir**, apesar do único composto
`(territory_id, number)` no banco. Uma violação de constraint chega como `IntegrityError`, envenena
a transação e não diz nada que o admin possa fazer. O banco segue como rede de segurança.

**`update` só compara o número quando ele muda de fato** — um PATCH que reenvia o número atual
junto com um novo contorno é o caso comum na tela do admin e não pode parecer conflito. Mesma
lógica do nome no `TerritoryService`.

**`update` exclui a própria quadra da checagem de sobreposição** (`exclude_id=block.id`). Sem isso,
todo redesenho seria rejeitado: o contorno novo quase sempre cobre o antigo. Verificado por mutação
(ver abaixo).

**`create` não precisa de `exclude_id`** — a quadra ainda não existe, então não há linha própria
com que colidir.

**Os testes-guarda foram provados não-vazios por mutação.** Seis dos 26 testes fixam comportamentos
que já passavam quando foram escritos (aceitações, não rejeições) — são guardas contra *excesso* de
rigor, que é o erro fácil aqui. Cada um foi confirmado com uma mutação temporária, revertida em
seguida:

| Mutação | Teste que quebrou |
|---------|-------------------|
| `update` sem `exclude_id` | 18 e 22 |
| `ST_Within` → `ST_ContainsProperly` | 8 (quadra igual ao contorno) |
| `find_overlapping` sem `NOT ST_Touches` | 10 (quadras encostadas) |
| `get_by_number` sem filtro de território | 6 (mesmo número em outro território) |

Os arquivos foram restaurados byte a byte (`diff` limpo) e a suíte voltou verde.

**O helper `square()` dos testes arredonda os cantos.** Float binário não soma decimais exatamente
(`0.2 + 0.1` é `0.30000000000000004`) e o PostGIS devolve a coordenada na precisão dele. Sem o
arredondamento, o teste das quadras encostadas falhava por causa do último bit de um float — o
comportamento estava certo, a comparação é que estava errada.

**Os territórios dos testes são criados pelo `TerritoryRepository`, não pelo `TerritoryService`.**
Simétrico ao que a Task 13 fez com as quadras: um bug de território não deve reprovar a suíte da
quadra. O que a quadra precisa do território é só que ele exista e tenha demarcação.

**`create`/`update` devolvem o model `Block`, não um DTO.** Quem monta `BlockOut` é o router
(Task 18); para o polígono ele chama `polygon_points`, que é onde o WKT e a ordem `(lng, lat)`
param. Nenhuma camada acima do service manipula geometria.

**`now_provider` é recebido e guardado sem uso.** `created_at` é carimbado pelo banco e
`last_worked_at` é escrito pelo service de log de trabalho (Task 15) — desenhar uma quadra nunca
precisa do relógio. A dependência está no construtor porque a spec a define assim, porque os
routers montam todos os services do mesmo jeito, e para que qualquer regra futura leia o relógio
injetado em vez de `datetime.now()`.

**`last_worked_at` não é tocado por este service.** Ele é projeção do `BlockWorkLog`, e escrevê-lo
daqui contrariaria a regra do `CLAUDE.md` de que a coluna é cache de leitura. O teste (l) apenas
fixa que uma quadra nova nasce `None` — que é o estado que o mapa pinta como "nunca trabalhada".

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d      # PostGIS precisa estar de pé
cd server
uv run pytest tests/services/test_block_service.py -q
uv run pytest --cov=app --cov-branch --cov-report=term-missing -q
uv run ruff check . && uv run ruff format --check .
```

## Resultado da validação

- `uv run pytest tests/services/test_block_service.py -q` → **26 passed**
- `uv run pytest --cov=app --cov-branch -q` → **295 passed** (suíte inteira, nada regrediu)
- Cobertura de `app/services/block.py`: **59 statements, 0 missing; 16 branches, 0 partial —
  100% de linha e de branch**
- Todos os services do projeto em 100% de linha e branch: `auth.py`, `user.py`, `territory.py`,
  `block.py`, `work_log.py`
- `ruff check .` → All checks passed · `ruff format --check .` → 52 files already formatted
