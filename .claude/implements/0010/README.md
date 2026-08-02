# [0010] Repositories geográficos com PostGIS

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 10

## Solicitação

> Spec 0001 — Task 10: Crie `server/app/repositories/territory.py`, `block.py` e
> `block_work_log.py`, cada um recebendo a `Session` no construtor e trabalhando com
> WKT/`ST_GeomFromText(:wkt, 4326)`. `TerritoryRepository`: CRUD por congregação, `get_by_name`, e
> **`find_overlapping(congregation_id, wkt, exclude_id=None)`** devolvendo os territórios da mesma
> congregação que se sobrepõem — o predicado é `ST_Intersects(boundary, g) AND NOT ST_Touches(boundary, g)`,
> de modo que encostar na divisa **não** conta. `BlockRepository`: CRUD por território,
> `next_free_number(territory_id)` devolvendo o menor inteiro ≥1 ainda não usado,
> `is_within_territory(territory_id, wkt)` usando `ST_Within(g, boundary)`,
> `find_overlapping(territory_id, wkt, exclude_id=None)` com o mesmo predicado de
> interseção-sem-toque, e `find_outside_boundary(territory_id, new_boundary_wkt)` devolvendo as
> quadras que ficariam fora de uma nova demarcação. `BlockWorkLogRepository`: `get(id)`,
> `create(...)`, `list_by_block(block_id)`, `delete(log)`, `latest_worked_at(block_id)`. Todos os
> predicados espaciais rodam **no banco**, nunca em Python. Nenhum método faz commit nem levanta
> exceção de domínio. Toque apenas em `app/repositories/`; não altere outras camadas.

## Contexto

Os models geográficos (implements/0003) e a migration (implements/0007) já existiam, mas nenhuma
consulta espacial tinha lugar para morar. Sem esta camada, os services das Tasks 13–15 escreveriam
SQL solto — exatamente o que a Arquitetura de Camadas do `CLAUDE.md` proíbe.

É aqui também que fica concentrada a decisão mais importante do domínio geométrico: **encostar na
divisa não é sobreposição**. `ST_Intersects` sozinho acusaria vizinhos legítimos, porque uma aresta
compartilhada é uma interseção. Subtrair `ST_Touches` deixa só os casos em que os *interiores* se
encontram.

## O que foi feito

Três repositórios, cada um uma classe fina sobre a `Session`, sem `commit` e sem exceção de domínio
(quem não achou devolve `None` ou lista vazia).

**`TerritoryRepository`** — `get` (já escopado por congregação, para que território alheio seja
indistinguível de inexistente), `get_by_name`, `list_by_congregation`, `create`, `update`, `delete`,
`find_overlapping` e `boundary_wkt`.

**`BlockRepository`** — `get`, `get_in_congregation`, `get_by_number`, `list_by_territory`,
`create`, `update`, `delete`, `set_last_worked_at`, `next_free_number`, `is_within_territory`,
`find_overlapping`, `find_outside_boundary` e `polygon_wkt`.

**`BlockWorkLogRepository`** — `get`, `create`, `list_by_block` (mais recente primeiro, na ordem do
índice), `delete` e `latest_worked_at`.

## Arquivos criados

- `server/app/repositories/territory.py` — consultas de `Territory`, incluindo a de sobreposição
- `server/app/repositories/block.py` — consultas de `Block`: numeração, contenção e sobreposição
- `server/app/repositories/block_work_log.py` — consultas do log de trabalho

## Arquivos modificados

Nenhum. `app/repositories/__init__.py` já havia sido criado pela Task 09, que rodou em paralelo, e
foi deixado intacto para não sobrescrever o trabalho dela.

## Decisões técnicas

**`WKTElement(wkt, srid=4326)` em vez de `func.ST_GeomFromText(...)` escrito à mão.** O GeoAlchemy2
compila `WKTElement` exatamente para `ST_GeomFromText(:param, 4326)` — verificado compilando a query
no dialeto PostgreSQL. Ganha-se o mesmo SQL que a task pede, com o bônus de o mesmo objeto servir
tanto para o `WHERE` quanto para a atribuição em um `INSERT`/`UPDATE`.

**`SRID = 4326` como constante nomeada** em cada módulo, para o número não divergir do declarado nas
colunas.

**`next_free_number` sem `generate_series`.** O conjunto de candidatos é `1` mais `n + 1` para cada
número `n` existente: o primeiro inteiro livre é sempre um deles — ou a sequência nunca começou, ou
começa logo depois de alguma quadra. Filtrar os já tomados e pegar o mínimo resolve em um único
statement e em O(n), enquanto `generate_series(1, max+1)` geraria 100 mil linhas se o admin
numerasse uma quadra como 100000. O maior número + 1 é sempre candidato e sempre livre, então o
resultado nunca é vazio.

**`get` do território já recebe `congregation_id`.** Filtrar na mesma query, em vez de carregar e
conferir depois, é o que garante o 404-em-vez-de-403 exigido pelo `CLAUDE.md`: o registro alheio
simplesmente não é carregado.

**`is_within_territory` devolve `False` para território inexistente.** Não há demarcação para estar
dentro de. Traduzir isso em `NotFoundError` é decisão de service, não de repositório — que por
contrato não levanta exceção de domínio.

**`boundary_wkt` / `polygon_wkt`.** A representação de armazenamento (WKB, ou o `WKTElement` ainda
preso ao objeto logo após o insert) para nesta camada; acima dela todo mundo fala o mesmo WKT que
`app/core/geo.py` lê. `to_shape` aceita as duas formas, então o método funciona antes e depois do
objeto expirar. Sem isso, os services das Tasks 13–14 acabariam importando GeoAlchemy2 para
converter geometria — vazamento de detalhe de persistência para a camada de regra.

**Dois métodos além do enunciado**, ambos consulta pura e ambos necessários às tasks seguintes:
`BlockRepository.get_in_congregation` (resolve em um `JOIN` a quadra vinda da URL já escopada pelo
token, evitando um N+1 via `block.territory`) e `set_last_worked_at` (a recomputação do cache passa
pela camada de dados como qualquer outra escrita; o *valor* continua sendo decidido pelo service).

**`flush()` sim, `commit()` nunca.** O `flush` é o que dá o id gerado ao chamador e o que faz o banco
cobrar as constraints num momento previsível; ele escreve dentro da transação aberta e continua
sendo desfeito por um rollback. A transação é do `get_session()`.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d     # PostGIS
cd server && uv run ruff check . && uv run pytest
```

A cobertura em teste automatizado vem das Tasks 13, 14 e 15, cujos services rodam contra PostGIS
real — não foram criados testes aqui porque a task restringe o escopo a `app/repositories/`.

## Resultado da validação

- `ruff check .` — All checks passed. `ruff format --check .` — 38 arquivos já formatados.
- `pytest` — **142 passed**, nenhuma regressão.
- Script descartável exercitando os três repositórios contra o **PostGIS real** (transação com
  rollback ao fim): **52 asserções, todas verdes**. Cobriu, entre outros, os pontos em que a regra
  poderia estar errada e o teste unitário não pegaria:
  - território que **encosta** na divisa **não** é sobreposição; o que invade, é
  - `exclude_id` impede o território/quadra de conflitar com a própria geometria armazenada
  - território de outra congregação com a mesma área não é comparado
  - `next_free_number`: vazio → 1; com 1, 2 e 4 → **3**; com apenas a 7 → **1**; depois de preencher
    o buraco → 5
  - `ST_Within` inclui a borda: quadra idêntica ao contorno é aceita, um vértice fora não é
  - `find_outside_boundary` lista exatamente as quadras que sobrariam fora de um contorno encolhido
  - `latest_worked_at` é o máximo, cai para o log remanescente ao apagar um e volta a `None` ao
    apagar o último
  - `DELETE` de território leva as quadras em cascata
