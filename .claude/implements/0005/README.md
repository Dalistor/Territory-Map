# [0005] Geo: conversão de coordenadas e pré-validação de polígono

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 07

## Solicitação

> Spec 0001 — Task 07: Implemente por TDD `server/app/core/geo.py`. Conteúdo: o dataclass congelado
> `LatLng(lat: float, lng: float)`; `points_to_wkt(points: list[LatLng]) -> str` gerando
> `POLYGON((lng lat, …))` **fechado** (primeiro ponto repetido no fim); `wkt_to_points(wkt) ->
> list[LatLng]` como inverso, **sem** repetir o ponto de fechamento; `validate_polygon(points)`
> levantando `InvalidPolygonError` de `app/core/exceptions.py` quando inválido. Critérios de aceite:
> (a) ida e volta de um quadrado preserva os pontos na ordem; (b) o WKT gerado inverte a ordem para
> `lng lat` e fecha o anel; (c) se a lista de entrada já vier fechada, o WKT não duplica o
> fechamento; (d) menos de 3 pontos distintos → `InvalidPolygonError`; (e) polígono em forma de "8"
> (auto-interseção) → `InvalidPolygonError`, usando Shapely `is_valid`/`is_simple`; (f) `lat` fora de
> [-90, 90] ou `lng` fora de [-180, 180] → `InvalidPolygonError`; (g) pontos consecutivos idênticos
> são tolerados desde que sobrem 3 distintos; (h) a mensagem do erro diz **qual** regra falhou. Este
> módulo não importa SQLAlchemy nem FastAPI. Toque apenas em `app/core/geo.py` e
> `tests/core/test_geo.py`.

## Contexto

O `CLAUDE.md` marca a ordem das coordenadas como a fonte clássica de bug deste domínio: PostGIS e
GeoJSON escrevem uma posição como `(longitude, latitude)`, enquanto os clientes `flutter_map` e todo
o modelo de dados leem `(latitude, longitude)`. A regra do projeto é que essa conversão viva em uma
única função testada, e não espalhada por services e repositories.

Além disso, as regras geométricas de verdade rodam no PostGIS, mas há um conjunto de checagens
baratas — quantidade de vértices, faixa das coordenadas, auto-interseção — que não precisam de ida
ao banco. Este módulo é essa pré-validação: falha rápido, em Python puro, antes de qualquer conexão.

Ele é dependência das Tasks 08 (DTOs), 13 (service de território) e 14 (service de quadra).

## Critérios de aceite

1. `LatLng` é um dataclass congelado — não é possível reatribuir `lat` depois de construído.
2. `points_to_wkt` inverte a ordem para `lng lat` e fecha o anel repetindo o primeiro ponto.
3. Uma lista que já chega fechada não ganha um segundo ponto de fechamento.
4. `wkt_to_points` devolve o anel **aberto**, em `(lat, lng)`, sem o vértice de fechamento.
5. `wkt_to_points` aceita tanto `POLYGON((...))` (formato do `ST_AsText`) quanto `POLYGON ((...))`
   (formato do Shapely).
6. WKT que não é polígono — `POINT`, `LINESTRING`, texto qualquer, string vazia — levanta
   `InvalidPolygonError` em vez de deixar vazar uma `GEOSException`.
7. A ida e volta de um quadrado preserva os pontos na mesma ordem em que entraram.
8. Polígono bem formado passa por `validate_polygon` sem erro.
9. Menos de 3 pontos **distintos** (vazio, 1 ponto, 2 pontos, 3 pontos com repetição) levanta
   `InvalidPolygonError` cuja mensagem cita "3 pontos distintos".
10. Pontos consecutivos idênticos são tolerados desde que sobrem 3 distintos.
11. Anel que já chega fechado é aceito (o vértice repetido não conta como quarto ponto).
12. Polígono em "8" (laço) levanta `InvalidPolygonError` cuja mensagem cita o cruzamento.
13. `lat` fora de [-90, 90] levanta erro cuja mensagem cita a latitude; `±90` exatos são aceitos.
14. `lng` fora de [-180, 180] levanta erro cuja mensagem cita a longitude; `±180` exatos são aceitos.
15. As três regras produzem **mensagens diferentes entre si** — o admin sabe qual regra bloqueou.
16. O módulo não carrega SQLAlchemy, GeoAlchemy2 nem FastAPI.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_latlng_is_frozen` | `server/tests/core/test_geo.py` | O módulo `app/core/geo.py` e o dataclass congelado `LatLng` |
| 2 | `test_points_to_wkt_swaps_to_lng_lat_and_closes_the_ring` | idem | `points_to_wkt`, com a inversão `lng lat` e o fechamento do anel |
| 3 | `test_points_to_wkt_does_not_duplicate_an_already_closed_ring` | idem | Fechamento condicional — só acrescenta o vértice se ele já não estiver lá |
| 4 | `test_wkt_to_points_swaps_back_to_lat_lng_and_drops_the_closing_vertex` | idem | `wkt_to_points` sobre `shapely.wkt.loads`, descartando o último vértice |
| 5 | `test_round_trip_of_a_square_preserves_the_points_in_order` | idem | (verde de imediato — caracteriza o critério (a) sobre a composição das duas funções) |
| 6 | `test_wkt_to_points_accepts_the_spacing_shapely_and_postgis_emit` | idem | (verde de imediato — caracteriza a tolerância de formato herdada do Shapely) |
| 7 | `test_wkt_to_points_rejects_anything_that_is_not_a_polygon` | idem | Tradução de `GEOSException`/geometria não-polígono para `InvalidPolygonError` |
| 8 | `test_validate_polygon_accepts_a_well_formed_square` | idem | Assinatura de `validate_polygon`, devolvendo `None` no caminho feliz |
| 9 | `test_validate_polygon_rejects_fewer_than_three_distinct_points` | idem | Contagem de vértices distintos com `MIN_DISTINCT_VERTICES` e `TOO_FEW_VERTICES_MESSAGE` |
| 10 | `test_validate_polygon_tolerates_repeated_consecutive_points` | idem | (verde de imediato — a contagem por conjunto já tolera repetição) |
| 11 | `test_validate_polygon_accepts_a_ring_that_arrives_already_closed` | idem | (verde de imediato — idem) |
| 12 | `test_validate_polygon_rejects_a_self_intersecting_figure_eight` | idem | Checagem `is_valid`/`exterior.is_simple` do Shapely e `SELF_INTERSECTION_MESSAGE` |
| 13 | `test_validate_polygon_rejects_latitude_outside_the_valid_range` | idem | Faixa WGS84 da latitude, checada **antes** das demais regras |
| 14 | `test_validate_polygon_rejects_longitude_outside_the_valid_range` | idem | Faixa WGS84 da longitude |
| 15 | `test_validate_polygon_accepts_the_exact_bounds_of_the_globe` | idem | (verde de imediato — confirma que os limites são inclusivos) |
| 16 | `test_each_broken_rule_reports_a_different_message` | idem | (verde de imediato — trava o critério (h) contra uma futura unificação das mensagens) |

Seis ciclos ficaram verdes de imediato. Nenhum deles é duplicata: são travas de regressão sobre
critérios de aceite explícitos da task (a, g, f, h) que a implementação mínima dos ciclos anteriores
já satisfazia. Foram mantidos porque descrevem contrato, não implementação.

## O que foi feito

Criado `app/core/geo.py` com quatro elementos públicos:

- `LatLng` — dataclass congelado e hashável (o `frozen=True` é o que permite contar vértices
  distintos com um `set`).
- `points_to_wkt` — conversor puro `(lat, lng)` → WKT `lng lat` fechado.
- `wkt_to_points` — o inverso, devolvendo o anel aberto.
- `validate_polygon` — pré-validação em três regras, cada uma com sua mensagem.

As mensagens vivem em constantes de módulo (`TOO_FEW_VERTICES_MESSAGE`,
`SELF_INTERSECTION_MESSAGE`, `LATITUDE_OUT_OF_RANGE_MESSAGE`, `LONGITUDE_OUT_OF_RANGE_MESSAGE`,
`NOT_A_POLYGON_MESSAGE`), o que deixa o critério (h) verificável e permite que os services de
território e quadra reaproveitem o texto sem duplicá-lo.

## Arquivos modificados

Nenhum. A task só acrescentou arquivos.

## Arquivos criados

- `server/app/core/geo.py` — a fronteira única entre `(lat, lng)` e a representação do PostGIS, mais
  a pré-validação barata de polígono.
- `server/tests/core/test_geo.py` — 27 testes cobrindo os 16 critérios acima.

## Decisões técnicas

- **`points_to_wkt` é conversor puro e não valida.** A task descreve `validate_polygon` como o
  validador; misturar validação no conversor deixaria `wkt_to_points` assimétrico e tornaria
  implícito, no service, um erro que a Task 13 exige que seja explícito. O contrato é: o service
  chama `validate_polygon` e só depois converte. Consequência assumida: `points_to_wkt([])` levanta
  `IndexError`, que é um erro de programação (chamar o conversor sem validar), não um erro de
  domínio.
- **Ordem das regras em `validate_polygon`: faixa → vértices distintos → topologia.** A faixa vem
  primeiro porque um par que não é uma posição na Terra torna as perguntas seguintes sem sentido, e
  porque é a checagem mais barata. A ordem é observável pelo teste que compara as três mensagens.
- **Contagem de vértices distintos por `set`, não por deduplicação de consecutivos.** Um `set`
  resolve de uma vez os dois casos que o critério (g) e o (c) descrevem — toque duplicado no mesmo
  ponto e anel já fechado — sem precisar saber se a repetição é adjacente. Um polígono com 4
  posições onde só 2 são distintas é rejeitado independentemente de onde a repetição esteja.
- **`is_valid` **e** `exterior.is_simple`.** O critério (e) pede os dois. Na prática o `is_valid` já
  pega o laço em "8"; o `is_simple` do anel externo é a segunda rede, e é o predicado que o PostGIS
  usará depois (`ST_IsSimple`), então manter os dois deixa a pré-validação alinhada com a validação
  final do banco em vez de aceitar algo que o banco recusaria.
- **`wkt_to_points` traduz `GEOSException` para `InvalidPolygonError`.** Este comportamento não
  estava listado nos critérios, mas `app/core/` fala o vocabulário de erro do domínio: deixar uma
  exceção do Shapely vazar até o router produziria um 500 onde a resposta correta é 422. É a única
  função do módulo que recebe entrada não confiável já serializada.
- **Limites do globo são inclusivos.** Os polos e o antimeridiano são posições reais, então `±90` e
  `±180` são aceitos — coerente com o `Field(ge=..., le=...)` que a Task 08 vai declarar nos DTOs.
- **Coordenadas em `str(float)` no WKT.** O `repr` de float do Python é *round-trip safe* desde a
  3.1, então a ida e volta não perde precisão, e o texto sai limpo (`-46.6`, não `-46.60000000001`).
- **Nada de teste contra banco nesta task.** O módulo é Python puro; os predicados que exigem
  PostGIS real (`ST_Within`, `ST_Touches`) são das Tasks 13 e 14.

## Como validar

```bash
cd server
uv run pytest tests/core/test_geo.py --cov=app.core.geo --cov-branch --cov-report=term-missing
uv run ruff check app/core/geo.py tests/core/test_geo.py
uv run ruff format --check app/core/geo.py tests/core/test_geo.py
```

## Resultado da validação

- `uv run pytest tests/core/test_geo.py` → **27 passed**.
- Cobertura de `app/core/geo.py`: **100% de linha e 100% de branch** (41 statements, 14 branches,
  0 miss, 0 parcial).
- `uv run pytest` (suíte inteira) → **40 passed** — inclui os testes da Task 06, executada em
  paralelo.
- `ruff check` e `ruff format --check` limpos nos dois arquivos desta task. As pendências de lint
  reportadas em `tests/core/test_security.py` são da Task 06 e não foram tocadas.
- Checagem de pureza: importar `app.core.geo` não carrega `sqlalchemy`, `fastapi` nem `geoalchemy2`.
