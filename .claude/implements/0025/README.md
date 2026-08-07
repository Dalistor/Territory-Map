# [0025] Pacote Dart compartilhado `packages/core`

**Data:** 2026-08-03
**Status:** Concluído
**Modo:** direto — **registro retroativo**
**Spec:** `.claude/specs/0002/` — Task 01 (a documentação; o código é anterior)

> **Este README foi escrito depois do fato.** O código entrou em `e4af19a`, `0b693aa` e `d1153bd`,
> sem passar por uma skill que documentasse na hora — é por isso que o `status.md` parava em 0024.
> A Task 01 da spec 0002 existe para fechar esse buraco. Nada aqui foi reimplementado: o texto
> descreve o que já está no repositório, e os "critérios de aceite" são os comportamentos que os
> testes existentes de fato travam, não uma lista escrita antes do código.

## Commits cobertos

| Commit | Assunto |
|--------|---------|
| `e4af19a` | `feat(core): shared Dart package with the models, the API client and geo` |
| `0b693aa` | `ci: run the shared package on every change, build the admin on a tag` |
| `d1153bd` | `ci: split the Dart workflows so the core one actually fires` |

## Solicitação

Construir o pacote Dart local que o app Android e o admin desktop compartilham, conforme o
`CLAUDE.md`: modelos do domínio, cliente HTTP da API e as conversões geométricas — **uma vez só**,
para que nenhum dos dois clientes reescreva o contrato do servidor.

## Contexto

O servidor estava completo (implementações 0001–0024) e nenhum cliente existia. As três coisas que
os dois clientes precisariam — falar com a API, entender os erros dela e converter coordenadas —
são exatamente as que não podem divergir entre eles: um app que troca latitude com longitude, ou que
lê o corpo de erro de um jeito diferente do admin, é um bug que só aparece em campo.

O `CLAUDE.md` já fixava a regra: `packages/core` **não depende de `flutter`**, só de `dart:core` e
do pacote HTTP. Isso é o que permite rodar a lógica compartilhada com `dart test`, em milissegundos,
sem emulador e sem janela — e é o que torna o TDD do lado cliente viável.

## Critérios de aceite

_Comportamentos que os 54 testes de `packages/core/test/` travam._

**Geo (`lib/geo/lat_lng.dart`) — meta de 100% do `CLAUDE.md`:**

1. `LatLng.fromJson` lê `{"lat", "lng"}` sem trocar os membros, e aceita inteiro no fio (JSON tem um
   tipo numérico só)
2. `toGeoJson()` escreve `[lng, lat]` e `fromGeoJson` lê nessa mesma ordem invertida — ida e volta
   preserva o ponto
3. `LatLng` compara por valor, que é o que permite deduplicar um anel
4. Os polos e o antimeridiano são posições válidas (limites inclusivos); um passo além é recusado
5. `validateRing` aceita quadrado simples, anel já fechado e contorno côncavo (a forma real de uma
   quadra)
6. `validateRing` recusa menos de 3 pontos **distintos** — canto repetido não conta
7. `validateRing` recusa figura-oito e contorno que volta por cima de si mesmo (colinear sobreposto)
8. Ponto fora do globo é reportado como tal **antes** de qualquer queixa sobre a forma, e a mensagem
   diz qual coordenada
9. Toda mensagem de `InvalidPolygonException` é escrita para o admin, em português
10. `isValidRing` responde `false` em vez de lançar — é o que o laço de desenho usa
11. `ringToJson` devolve o anel **aberto**, porque o servidor fecha sozinho

**Cliente da API (`lib/api/api_client.dart`):**

12. `X-App-Key` vai em **toda** requisição; nenhum caso de uso precisa lembrar disso
13. Nenhum `Authorization` antes de um token ser definido; o bearer vai depois de definido, e para
    de ir quando limpo
14. `activate` normaliza o código (`trim` + maiúsculas) antes de enviar — ele é digitado à mão
15. Criar território ou quadra pré-valida o anel localmente e **não chega à rede** se for impossível
16. Um `PATCH` omite do corpo o campo ausente, em vez de mandar `null`
17. `markBlockWorked` responde `true` quando o servidor criou o registro e `false` quando já
    conhecia aquele `log_id` — é o que torna o reenvio offline idempotente
18. `worked_at` é enviado em UTC com offset
19. `{"code","detail"}` do servidor vira `ApiErrorException` com `isUnauthorized`/`isNotFound`/
    `isConflict`/`isRuleViolation`/`isRateLimited`
20. Conexão caída, página de erro HTML de proxy e resposta 200 que não é JSON viram
    `NetworkException` — o chamador nunca precisa distinguir falha de HTTP de falha de parsing
21. O 422 de campo do próprio FastAPI vira mensagem de bug do cliente, não de regra de negócio
22. **Um `{"detail": "..."}` sem `code` — o que as dependências de autenticação do FastAPI levantam
    — chega como 401 reconhecível, não como erro opaco**

## O que foi feito

`packages/core`, Dart puro, com três pastas e um barril:

- **`lib/geo/lat_lng.dart`** — `LatLng` imutável, os limites WGS84, `validateRing` / `isValidRing` e
  `ringFromJson` / `ringToJson`. É a **única** conversão entre a ordem nomeada da API
  (`{lat, lng}`), a ordem do GeoJSON (`[lng, lat]`) e a do `flutter_map` (`(lat, lng)`).
- **`lib/api/api_client.dart`** — `TerritoryMapApi`, com a superfície inteira: `login`, `activate`,
  publicadores, territórios, quadras, work logs e `markBlockWorked`.
- **`lib/api/api_exception.dart`** — `ApiException` selada, com `ApiErrorException` (o servidor
  recusou por um motivo que ele nomeou) e `NetworkException` (não houve resposta utilizável).
- **`lib/models/models.dart`** — `Congregation`, `Publisher`, `PublisherBrief`, `Territory`,
  `Block`, `WorkLog`, `AdminSession`, `AppSession`. Todos `@immutable`, todos parseando direto das
  respostas.
- **`lib/territory_core.dart`** — o barril que os dois clientes importam.

E os workflows do lado Dart: `core.yml` (formato, análise, teste e o portão de cobertura de `geo/`)
e `admin-release.yml` (build por tag, inerte enquanto `admin/` não existia).

## Arquivos criados

- `packages/core/pubspec.yaml`, `packages/core/pubspec.lock`, `packages/core/analysis_options.yaml`
- `packages/core/lib/territory_core.dart`
- `packages/core/lib/geo/lat_lng.dart`
- `packages/core/lib/api/api_client.dart`
- `packages/core/lib/api/api_exception.dart`
- `packages/core/lib/models/models.dart`
- `packages/core/test/geo/lat_lng_test.dart` — 27 testes
- `packages/core/test/api/api_client_test.dart` — 27 testes
- `.github/workflows/core.yml`
- `.github/workflows/admin-release.yml`

## Arquivos modificados

- `CLAUDE.md` — registro do pacote
- `.gitignore` — artefatos do Dart

## Decisões técnicas

**Sem dependência de `flutter`, e o CI cobra isso.** O job `core` roda com o **SDK do Dart puro**,
não com o Flutter, de propósito: um `import 'package:flutter/...'` acidental quebra o job em vez de
passar despercebido até o primeiro consumidor puro. É a regra do `CLAUDE.md` transformada em falha
de build.

**A API fala `{"lat","lng"}` nomeado, nunca um par solto.** Um cliente não consegue trocar os
membros em silêncio. A inversão para GeoJSON existe num lugar só, com teste de ida e volta — é o bug
clássico deste projeto e não se resolve com atenção, se resolve com uma função única.

**Pré-validação local, autoridade no servidor.** `validateRing` reproduz o que o servidor faz por
Shapely (limites, três cantos distintos, sem auto-interseção) para que um desenho impossível não
saia da máquina. Sobreposição, contenção e numeração continuam sendo do PostGIS — só ele sabe onde
estão as outras formas. Isto é *feedback*, não uma segunda opinião.

**Pontos duplicados são colapsados antes do teste de auto-interseção.** Uma aresta de comprimento
zero é um ponto: não cruza nada, mas é colinear com tudo que passa por ela. Deixá-la reportaria
auto-interseção onde há só um vértice repetido. Colapsar primeiro faz os dois problemas sumirem e
alinha o resultado com o que o servidor enxerga.

**Colinear e sobreposto conta como cruzamento.** O contorno volta por cima de si mesmo, e o PostGIS
recusa isso como "não simples" do mesmo jeito.

**O `X-App-Key` e o bearer são injetados pelo cliente HTTP.** Nenhum caso de uso deve saber que
existem. A chave não é autenticação — viaja dentro do APK e do binário —, e isso está escrito no
próprio arquivo para que ninguém a confunda com uma fronteira.

**`ApiException` é `sealed`.** O `switch` exaustivo no cliente é o que impede um caso de erro novo
de passar despercebido pela UI.

**Erro sem `code` vira 401 reconhecível.** Rodar o cliente contra o servidor real expôs uma lacuna
de verdade: as dependências de autenticação levantam o `HTTPException` do FastAPI, cujo corpo é um
`{"detail": "..."}` seco, sem `code`. O JWT de admin expirado — a falha mais comum que o admin vai
encontrar, a cada 12 horas — estava chegando como `NetworkException` opaco em vez de um 401 sobre o
qual a UI pode agir. `_codeForStatus` cobre esse caso.

**`markBlockWorked` devolve booleano em vez de void.** 201 significa "criei"; 200 significa "já
tinha esse `log_id`". É o que a fila offline precisa saber para não contar duas visitas.

**Os dois workflows são separados.** Um evento `push` que declara `tags` e não declara `branches`
casa **só** com tag — o workflow combinado ficava mudo em todo push comum, e o filtro de `paths`
não salvava. Pior: manter os dois juntos aplicaria o filtro de `paths` também ao push da tag, e uma
tag de release cujo commit não tocasse `admin/` pularia o build. Daí `core.yml` (push e PR) e
`admin-release.yml` (tag `v*`).

**O portão de cobertura de `geo/` é verificado falhando.** O `CLAUDE.md` pede 100% em `geo/`; o
`awk` sobre o `lcov.info` foi conferido abaixo de 100% para provar que ele barra, não só que passa.

## Como validar

```
cd packages/core && dart pub get && dart test
dart analyze --fatal-infos
dart format --output=none --set-exit-if-changed .
```

## Resultado da validação

- `dart test` → **54 passed** (27 em `geo/`, 27 em `api/`)
- `geo/` em 100% de linha, cobrado pelo job `core` do `.github/workflows/core.yml`
- `dart analyze --fatal-infos` e `dart format --set-exit-if-changed` limpos
- Exercitado também contra o servidor real, que foi o que revelou o caso do `detail` sem `code`

## O que ficou sem cobertura

- **`lib/models/`** não tem arquivo de teste próprio. Os modelos são exercitados indiretamente pelo
  `api_client_test.dart`, que parseia respostas reais em `Territory`, `Block`, `Publisher` e
  `WorkLog`. O que não está coberto diretamente são os poucos comportamentos que os modelos têm:
  `Publisher.hasLiveCode`, `Publisher.isPending`, `Block.timeSinceWorked` e `WorkLog.wasSyncedLate`.
  Nenhum deles é regra de negócio (a regra vive no servidor), mas todos alimentam decisão de tela —
  a cor da quadra no mapa e o subtítulo do publicador.
- O `CLAUDE.md` exige 100% só em `geo/`, então isto não viola a meta declarada; fica registrado como
  a lacuna que é.
