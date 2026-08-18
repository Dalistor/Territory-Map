# [0085] App/Data: cache local de territórios e quadras

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0005/` — Task 21

## Solicitação

Spec 0005 — Task 21: Implementar por TDD, em `app/src/data/territory-cache.ts`, usando
`AsyncStorage`, `saveTerritories(territories: Territory[]): Promise<void>` e
`getCachedTerritories(): Promise<Territory[] | null>` (`null` quando nunca houve um `save`
anterior), mais `clearCache(): Promise<void>` para uma task futura (navegação raiz) limpar o cache
junto com a sessão quando o token for revogado/expirado.

## Contexto

O app precisa desenhar o último mapa conhecido mesmo sem sinal em campo (regra já descrita no
`CLAUDE.md`, seção "App Android": "Faz cache local dos territórios e quadras para funcionar sem
sinal em campo"). Esta task cria o módulo de persistência desse cache; quem o alimenta
(`listTerritories` da Task 18, já implementado em `data/api-client.ts`) e quem o lê (a tela de
mapa/dashboard e o roteamento raiz da Task 26) ficam para tasks seguintes.

## Critérios de aceite

- Caminho feliz: `saveTerritories` seguido de `getCachedTerritories` devolve exatamente a lista
  salva — incluindo a revivificação de `Block.lastWorkedAt` de volta para `Date` (o JSON round trip
  degrada `Date` para `string`).
- Caminho feliz: `getCachedTerritories` sem nenhum `save` anterior devolve `null`, distinto de uma
  lista vazia salva de propósito.
- Caminho feliz: `clearCache` seguido de `getCachedTerritories` devolve `null`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `getCachedTerritories` retorna `null`, `saveTerritories`+`getCachedTerritories` devolve a lista salva (com `Date` revivido), `clearCache`+`getCachedTerritories` devolve `null` | `app/src/data/territory-cache.test.ts` | `app/src/data/territory-cache.ts`: `saveTerritories`, `getCachedTerritories` (com `reviveBlock`), `clearCache` |

Os três comportamentos foram cobertos num único ciclo: a implementação mínima que atende ao
primeiro teste (round-trip via `AsyncStorage.setItem`/`getItem`/`removeItem`) já é a implementação
completa dos outros dois, então não fazia sentido artificialmente vermelho-verde três vezes sobre o
mesmo código.

## O que foi feito

Criado `app/src/data/territory-cache.ts` com três funções:
- `saveTerritories`: serializa a lista via `JSON.stringify` e grava em `AsyncStorage` sob a chave
  `territory-map/territories-cache`.
- `getCachedTerritories`: lê a chave; `null` do `AsyncStorage.getItem` vira `null` (nunca salvo);
  caso contrário, faz `JSON.parse` e revive `Block.lastWorkedAt` (que o JSON degrada para `string`)
  de volta para `Date`.
- `clearCache`: remove a chave.

## Arquivos criados

- `app/src/data/territory-cache.ts` — o módulo de cache.
- `app/src/data/territory-cache.test.ts` — os três comportamentos, com `AsyncStorage` mockado por
  um fake em memória local ao arquivo de teste.

## Decisões técnicas

- **Mock de `AsyncStorage`: fake em memória hand-rolled, não o mock publicado pela lib.** O pacote
  `@react-native-async-storage/async-storage` expõe um mock em
  `@react-native-async-storage/async-storage/jest` (`AsyncStorageMock`), mas ele é publicado como
  ESM (`lib/module/`) e o `transformIgnorePatterns` do preset `@react-native/jest-preset` só
  transforma `react-native`/`@react-native(-community)?` — `@react-native-async-storage` fica de
  fora, e o `require` do mock falha com `SyntaxError: Unexpected token 'export'`. Ajustar
  `transformIgnorePatterns` global só para viabilizar um teste violaria "toque apenas
  `territory-cache.ts` e seu teste". A alternativa sem esse custo, e que já é o padrão do projeto —
  `session-store.test.ts`'s `installFakeKeychain` faz exatamente isso para `react-native-keychain` —
  é mockar o módulo com uma fábrica que implementa `getItem`/`setItem`/`removeItem`/`clear` sobre um
  `Record<string, string>` local ao teste. O que fica sob teste continua sendo a lógica própria do
  módulo (serialização, revivificação de `Date`, a distinção `null` vs. `[]`), não a biblioteca de
  terceiro.
- **Revivificação de `Date` em `Block.lastWorkedAt`.** `Territory`/`Block` (`app/src/domain/models.ts`)
  usam `Date` nativo. `JSON.stringify` grava `Date` como string ISO; sem reviver na leitura,
  `getCachedTerritories` devolveria um objeto com `lastWorkedAt: string`, quebrando o contrato do
  tipo (e o teste teria falhado por `toEqual` comparar `Date` com `string`). `reviveBlock` cobre só
  esse campo — é o único `Date` que existe dentro de `Territory`/`Block`.
- **`null` como estado explícito de "nunca salvo".** `AsyncStorage.getItem` já devolve `null` para
  chave inexistente, então bastou não interceptar esse caso — nenhuma lógica extra foi necessária
  além de não confundi-lo com uma lista vazia serializada (`'[]'`, que é um valor truthy diferente
  de `null`).
- **Chave namespaced (`territory-map/territories-cache`)**, mesmo espírito do
  `KEYCHAIN_SERVICE`/`KEYCHAIN_USERNAME` de `session-store.ts`, para não colidir com outra entrada
  que algum módulo futuro venha a guardar em `AsyncStorage` (ex.: a fila offline da Task 20).
- Nada foi deixado sem teste: as três funções e os dois ramos de `getCachedTerritories` (nunca
  salvo vs. salvo, com e sem `lastWorkedAt`) estão exercitados.

## Como validar

```bash
cd app && npx jest src/data/territory-cache.test.ts
cd app && npx jest --coverage --collectCoverageFrom='src/data/territory-cache.ts' src/data/territory-cache.test.ts
cd app && npx tsc --noEmit -p .
cd app && npx eslint src/data/territory-cache.ts src/data/territory-cache.test.ts
```

## Resultado da validação

- `npx jest src/data/territory-cache.test.ts` — 3 testes, todos verdes.
- `npx jest` (suíte inteira do `app/`) — 8 suítes, 36 testes, todos verdes (nenhuma regressão).
- `npx jest --coverage --collectCoverageFrom='src/data/territory-cache.ts' ...` —
  100% statements / 100% branch / 100% functions / 100% lines em `territory-cache.ts`.
- `npx tsc --noEmit -p .` — sem erros.
- `npx eslint src/data/territory-cache.ts src/data/territory-cache.test.ts` — sem warnings.
