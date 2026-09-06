# [0079] App/Domain: entidades e regras puras

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0005/` — Task 17

## Solicitação

Spec 0005 — Task 17: em `app/src/domain/models.ts`, declarar as interfaces `Territory`, `Block`,
`WorkedTerritory`, `PublisherBrief`, `Session` (token + `PublisherBrief` + `congregation`),
espelhando os campos que os schemas do servidor devolvem (mesmo espírito de
`admin/src/shared/models.ts`). Em `app/src/domain/blockColor.ts`, portar `blockColorCategory` e
`OVERDUE_AFTER_MS` exatamente como estão em `admin/src/renderer/map/blockColor.ts`. Em
`app/src/domain/assignment.ts`, adicionar `isTerritoryAssignedToMe`. Tudo com testes Jest puros,
sem depender de `react-native`.

## Contexto

Task 17 da spec 0005 (app do publicador em React Native). É a primeira task de domínio do app
depois do scaffold (Task 16, implementação 0074): os tipos e as regras puras que o resto do app
(dashboard, mapa, marcação de quadra) vai consumir, sem nenhuma dependência de React Native, HTTP
ou armazenamento — a mesma separação de camadas que `admin/src/shared/` já usa no admin Electron.

## Critérios de aceite

- `app/src/domain/models.ts` declara `LatLng`, `Congregation`, `PublisherBrief`, `Block`,
  `Territory`, `WorkedTerritory` e `Session`, com os mesmos nomes de campo (`camelCase`) e a mesma
  convenção de opcional-para-ausente (`lastWorkedAt?: Date`, `assignedUser?: PublisherBrief`) que
  `admin/src/shared/models.ts` usa para os schemas equivalentes do servidor.
- `app/src/domain/blockColor.ts` exporta `OVERDUE_AFTER_MS` (120 dias em ms) e `blockColorCategory`,
  com o mesmo comportamento do admin:
  - `'never'` quando `lastWorkedAt` está ausente.
  - `'overdue'` quando o tempo desde a última visita é estritamente maior que `OVERDUE_AFTER_MS`.
  - `'recent'` nos demais casos, inclusive exatamente nos 120 dias.
- `app/src/domain/assignment.ts` exporta `isTerritoryAssignedToMe(territory, userId)`, verdadeiro
  só quando `territory.assignedUser?.id === userId` — falso quando `assignedUser` é `undefined` e
  falso quando é de outra pessoa.
- Nenhum dos três arquivos importa `react-native`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `is "never" when the block was never worked` | `app/src/domain/blockColor.test.ts` | `blockColorCategory` retornando `'never'` |
| 2 | `is "overdue" when the time since worked is strictly greater than OVERDUE_AFTER_MS` | `app/src/domain/blockColor.test.ts` | ramo `'overdue'` |
| 3 | `is "recent" when the time since worked is exactly OVERDUE_AFTER_MS` | `app/src/domain/blockColor.test.ts` | fronteira `>` (não `>=`) do ramo `'overdue'` |
| 4 | `is "recent" when the time since worked is less than OVERDUE_AFTER_MS` | `app/src/domain/blockColor.test.ts` | confirmação do ramo `'recent'` |
| 5 | `is true when the assigned user id matches the given user id` | `app/src/domain/assignment.test.ts` | `isTerritoryAssignedToMe` retornando `true` |
| 6 | `is false when the territory has no assigned user` | `app/src/domain/assignment.test.ts` | uso do optional chaining (`assignedUser?.id`) em vez de acesso direto |
| 7 | `is false when the assigned user is someone else` | `app/src/domain/assignment.test.ts` | comparação por `id`, não por referência de objeto |

Os quatro primeiros ciclos foram escritos de uma vez (mesmo arquivo de teste que
`admin/src/renderer/map/blockColor.test.ts` já cobre integralmente, só trocando a data-base para o
dia de hoje) e confirmados falhando juntos por "módulo não encontrado" antes da implementação —
depois, cada asserção foi conferida uma a uma contra a lógica implementada. Os três ciclos de
`assignment.ts` seguiram o mesmo padrão.

`models.ts` não teve ciclo próprio: é só declaração de tipos, sem comportamento em tempo de
execução para testar — a interface é validada indiretamente pelos dois arquivos que a consomem
(o `tsc --noEmit` da validação final é quem garante que os campos usados nos testes existem no
tipo).

## O que foi feito

Criados os três arquivos de domínio do app que a Task 16 (scaffold) deixou como placeholder, mais
os dois arquivos de teste. `models.ts` inclui também `LatLng`, que nenhuma task da spec ainda havia
criado para o app — decisão registrada abaixo.

## Arquivos criados

- `app/src/domain/models.ts` — `LatLng`, `Congregation`, `PublisherBrief`, `Block`, `Territory`,
  `WorkedTerritory`, `Session`.
- `app/src/domain/blockColor.ts` — `OVERDUE_AFTER_MS`, `BlockColorCategory`, `blockColorCategory`.
- `app/src/domain/assignment.ts` — `isTerritoryAssignedToMe`.
- `app/src/domain/blockColor.test.ts`
- `app/src/domain/assignment.test.ts`

## Decisões técnicas

- **`LatLng` ficou dentro de `models.ts`, não num `geo.ts` próprio.** A spec não tem nenhuma task
  que crie um módulo de geometria para o app (diferente do admin, que tem `shared/geo.ts` com
  validação de polígono self-intersection etc.) — isso provavelmente chega numa task futura, quando
  o editor de mapa precisar de fato manipular anéis. Criar esse arquivo agora seria antecipar
  escopo que a Task 17 não pediu ("toque apenas os três arquivos citados"). `LatLng` é só o par
  nomeado `{lat, lng}`, sem lógica — cabe como um tipo a mais dentro de `models.ts` sem violar o
  espírito da task, e pode subir para um `geo.ts` próprio quando essa lógica existir.
- **`blockColorCategory` não reusa um `blockTimeSinceWorked` separado.** No admin, essa função vive
  em `shared/models.ts` e é importada por `blockColor.ts`. Como a Task 17 pede para tocar só os três
  arquivos citados e `models.ts` deve conter apenas as interfaces declaradas no pedido, o cálculo
  (`now.getTime() - block.lastWorkedAt.getTime()`) ficou inline dentro de `blockColorCategory` —
  mesmo resultado, um nível a menos de indireção, sem função extra fora do que foi pedido.
- **`Session` não inclui os campos do publicador achatados.** Segue o pedido literal
  ("token + `PublisherBrief` + congregation"): `user: PublisherBrief` e `congregation: Congregation`
  aninhados, mesma forma de `ActivateOut` no servidor.
- **Sem mock**: os três arquivos são funções puras sobre tipos simples: não há infraestrutura para
  fake, relógio ou rede — os testes passam `Date` fixas construídas no próprio teste.

## Como validar

```bash
cd app && npx jest src/domain/blockColor.test.ts src/domain/assignment.test.ts
cd app && npx tsc --noEmit
cd app && npx eslint src/domain
```

## Resultado da validação

- `npx jest src/domain/blockColor.test.ts src/domain/assignment.test.ts` — 7 testes, todos
  passando.
- `npx jest` (suíte inteira do app) — 3 suítes relevantes passando (`blockColor.test.ts`,
  `assignment.test.ts`, `__tests__/App.test.tsx`, herdado do scaffold), 8 testes. Uma quarta suíte,
  `src/data/api-client.test.ts`, falha por módulo ausente — pertence à Task 18 (Data: cliente HTTP),
  em andamento em paralelo por outro subagente da mesma spec, fora do escopo desta task; não foi
  tocada.
- `npx jest --coverage --collectCoverageFrom='src/domain/**/*.ts'` sobre `assignment.ts` e
  `blockColor.ts`: 100% linha, branch, função e statement. `models.ts` aparece com 0% porque não tem
  nenhuma instrução em tempo de execução (só `interface`) — não é uma lacuna de teste, é ausência de
  comportamento a testar.
- `npx tsc --noEmit` — sem erros.
- `npx eslint src/domain` — sem warnings.
