# [0172] App admin: modelos do domínio e conversão de coordenadas (spec 0012, Task 02)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0012/` — Task 02

## Solicitação

> Spec 0012 — Task 02: Implemente por TDD `admin-app/src/domain/models.ts` (e `models.test.ts` ao
> lado). Leia antes `app/src/domain/models.ts`, `admin/src/shared/models.ts` e
> `admin/src/shared/geo.ts`, e mantenha os mesmos nomes de campo em camelCase; o que muda é o
> conjunto de entidades, porque o admin precisa de `Assignment` e `Publisher`, que o app do
> publicador não tem. Declare: `LatLng`, `Congregation`, `Publisher`, `BlockStatusOverride`,
> `Block`, `Territory`, `Assignment` e `WorkLog`.
>
> Implemente também as duas funções de conversão de coordenada, e **elas são o único lugar do
> projeto onde a ordem lat/lng é invertida**: `toLatLngList(coordinates: number[][]): LatLng[]` e
> `toGeoJsonRing(points: LatLng[]): number[][]`, que fecha o anel repetindo o primeiro ponto no fim
> se ele ainda não estiver fechado.
>
> Este arquivo é código puro: não importe `react-native`, `fetch` nem nada de `data/`.

## Contexto

O scaffold do `admin-app/` (Task 01, implements/0170) deixou `src/domain/` vazio. Esta task é a
primeira camada real do app admin Android: as entidades que todas as telas e o cliente HTTP vão
trocar entre si, e a única função que inverte a ordem das coordenadas.

A inversão é o bug clássico deste projeto — PostGIS e GeoJSON escrevem `[lng, lat]`, MapLibre e
Leaflet leem `(lat, lng)`. Cada cliente já concentra essa conversão num arquivo só e testado
(`admin/src/shared/geo.ts`, `app/src/domain/models.ts`); `admin-app/` passa a ter o seu.

## Critérios de aceite

- `toLatLngList([[-46.6, -23.5], [-46.5, -23.4], [-46.4, -23.6]])` devolve três pontos com `lat`
  −23.5/−23.4/−23.6 e `lng` −46.6/−46.5/−46.4 — nessa ordem, sem trocar os eixos.
- `toGeoJsonRing` de três pontos devolve **quatro** pares, o último igual ao primeiro.
- `toGeoJsonRing` de um anel que já vem fechado não acrescenta um quinto par duplicado.
- `toLatLngList(toGeoJsonRing(pontos))` devolve os pontos originais mais o de fechamento.
- `toLatLngList([])` devolve `[]`; `toGeoJsonRing([])` devolve `[]` sem estourar ao ler o primeiro
  ponto.
- As oito entidades existem com os campos e nomes camelCase especificados.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | lê um anel GeoJSON como lat/lng, sem trocar os eixos | `admin-app/src/domain/models.test.ts` | `LatLng` e `toLatLngList` |
| 2 | lê um anel vazio como lista vazia | idem | — (já coberto pelo `map`; mantido como regressão) |
| 3 | escreve longitude primeiro e fecha o anel repetindo o primeiro ponto | idem | `toGeoJsonRing`, sempre fechando |
| 4 | deixa em paz um anel que já se fecha, em vez de repetir o ponto duas vezes | idem | comparação primeiro/último antes de fechar |
| 5 | escreve lista vazia como anel vazio, sem primeiro ponto para ler | idem | guarda de saída antecipada |
| 6 | ida e volta preserva todos os valores, acrescentando só o fechamento | idem | — (consequência; mantido como regressão) |
| 7 | não tem o que fechar com um ponto só | idem | — (borda documentada) |
| 8 | `Congregation` é a congregação em que o admin entrou | idem | `Congregation` |
| 9 | `Publisher`: código vivo, código já resgatado, e desativação sem perder a pessoa | idem | `PublisherBrief`, `Publisher` |
| 10 | `Block`: território dono, "nunca trabalhada" nulo, e os dois status forçáveis | idem | `BlockStatusOverride`, `Block` |
| 11 | `Territory`: dirigente e rotação, ambos nulos no padrão, e as quadras | idem | `Territory` |
| 12 | `Assignment`: aberta sem data de conclusão, histórico com as duas, nome que sobrevive | idem | `Assignment` |
| 13 | `WorkLog`: quem trabalhou qual quadra, e quando | idem | `WorkLog` |

Os ciclos 2, 6 e 7 passaram sem exigir código novo — são consequências das duas funções já estarem
corretas. Como os três são critérios de aceite explícitos (ou bordas declaradas), ficaram como
guarda de regressão em vez de serem removidos; está registrado aqui para não parecerem ciclos
inventados.

## O que foi feito

`admin-app/src/domain/models.ts` declara as oito entidades pedidas mais `PublisherBrief` (o
`{id, name}` aninhado que `Territory`, `Assignment` e `WorkLog` compartilham) e as duas funções de
conversão. O arquivo não importa nada — é Domain puro, como a camada exige.

## Arquivos criados

- `admin-app/src/domain/models.ts` — entidades do app admin e as duas conversões de coordenada
- `admin-app/src/domain/models.test.ts` — 21 testes cobrindo os dois grupos

## Arquivos modificados

Nenhum. `src/domain/index.ts` continua o `export {}` que o scaffold deixou, seguindo
`app/src/domain/index.ts`, que também nunca virou barrel de verdade.

## Decisões técnicas

**Ausência é `null`, não `undefined`** — é a diferença deliberada em relação a
`app/src/domain/models.ts` e `admin/src/shared/models.ts`, que usam `?`/`undefined`. A instrução da
task especifica `| null` campo a campo, e a razão sustenta: a API manda JSON `null` e o parser da
Task 04 repassa direto, então "nunca trabalhada" e "sem dirigente" continuam sendo valores que quem
chama precisa tratar, em vez de uma chave que silenciosamente não está lá.

**Anel já fechado não é fechado de novo.** Um ponto de fechamento duplicado é uma aresta de
comprimento zero, que o PostGIS lê como problema de forma, não como o engano inofensivo que é.
Mesmo cuidado que `openRing` tem em `admin/src/shared/geo.ts`.

**Um ponto só não tem o que fechar.** Caso degenerado que nenhum critério de aceite nomeia (o
mínimo real é 3 vértices). A implementação compara primeiro e último, que com um elemento são o
mesmo, e devolve o par intacto — em vez de duplicá-lo. Está testado para a escolha ficar registrada
em vez de ser acidente de implementação.

**`PublisherBrief` extraído.** `Territory.assignedPublisher`, `Assignment.publisher` e
`WorkLog.publisher` são o mesmo `{id, name}`; declarar uma vez segue o que os outros dois clientes
já fazem. Não é entidade nova — é o `UserBriefOut` do servidor.

**Os testes de entidade são verificados pelo `tsc`, não pelo Jest.** O Babel apaga um
`import type` sem conferi-lo, então o Jest sozinho não falharia com um campo faltando ou errado — o
RED desses sete ciclos foi `npx tsc --noEmit` acusando `TS2305: has no exported member`. Os
`expect` em tempo de execução documentam o que cada campo significa e impedem que os literais virem
código morto; quem morde é o type checker. O cabeçalho do arquivo de teste diz isso, para nenhum
leitor futuro confundir os dois grupos.

**Nada foi mockado**, porque não há o que mockar: sem relógio, sem rede, sem armazenamento. Todas as
datas dos testes são literais fixos.

## Como validar

```bash
cd admin-app
npx jest src/domain/models.test.ts
npx jest src/domain --coverage --collectCoverageFrom='src/domain/models.ts'
npx tsc --noEmit
npm run lint
```

## Resultado da validação

- `npx jest src/domain/models.test.ts` → **21 testes passando**, 1 suíte
- Cobertura de `src/domain/models.ts` → **100% de statements, branches, functions e lines**
- `npx tsc --noEmit` → sem erros
- `npm run lint` → sem erro e sem warning
- `npx jest` (suíte inteira do `admin-app/`) → 3 suítes passando, 30 testes (inclui o smoke test do
  scaffold e o `credentials-store.test.ts` da Task 05, que rodava em paralelo)
