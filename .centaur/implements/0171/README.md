# [0171] App admin Android: credenciais da congregação no keystore (spec 0012, Task 05)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0012/` — Task 05

## Solicitação

> Spec 0012 — Task 05: Implemente por TDD `admin-app/src/data/credentials-store.ts` e
> `credentials-store.test.ts`. Leia antes `app/src/data/session-store.ts` (o padrão de uso do
> `react-native-keychain` com `service` próprio e `username` fixo) e
> `admin/src/main/credentials-store.ts` (o contrato `read`/`write`/`clear` que esta task porta do
> `safeStorage` do Electron para o keystore do Android). Exporte a interface `Credentials`
> (`{name, city, password}`) e as funções `saveCredentials(credentials)`,
> `readCredentials(): Promise<Credentials | null>` e `clearCredentials()`. Use um `service` de
> keychain próprio (ex.: `'territory-map-admin/credentials'`), distinto do que `app/` usa, e
> serialize com `JSON.stringify`. Nos testes, `react-native-keychain` é mockado — nunca toque no
> keystore real.

## Contexto

O app admin Android não tem tela de login no dia a dia — mesma decisão que o admin desktop já
carrega. Isso obriga o app a guardar **a senha**, e não só um token: o JWT do admin dura 12h e
alguém precisa renová-lo sem perguntar nada a quem está em campo. Este módulo é o lugar onde os
três campos ficam entre uma abertura e outra, e é o que a Task 06 (`session.ts`) vai ler para
refazer o login em silêncio.

É o porte do contrato de `admin/src/main/credentials-store.ts` (`read`/`write`/`clear` sobre o
`safeStorage` do Electron) para o keystore do Android, com a forma de módulo de funções soltas que
`app/src/data/session-store.ts` já usa neste monorepo — em vez da fábrica com dependências
injetadas do desktop, porque aqui a dependência (`react-native-keychain`) já é substituível pelo
mock global do Jest, e uma fábrica só acrescentaria cerimônia.

## Critérios de aceite

- `saveCredentials` seguido de `readCredentials` devolve os mesmos três campos.
- `readCredentials` sem nada gravado devolve `null` (o mock devolvendo `false`, que é o que a lib
  faz quando não há entrada).
- `clearCredentials` faz `readCredentials` voltar a `null`.
- `saveCredentials` chama a lib com o `service` desta aplicação, e não com o de `app/`.
- Um conteúdo gravado que não é JSON válido faz `readCredentials` devolver `null` em vez de
  estourar — um keystore corrompido devolve o admin à tela de configuração, não a um crash.
- Nenhum teste, e nenhum caminho do código, escreve a senha num `console.*`.

Dois casos acrescentados durante a execução, pela mesma razão do critério do JSON inválido
(um registro quebrado não conta como "configurado"):

- JSON válido a que falta um dos três campos devolve `null`.
- JSON válido que não é objeto (`'null'`, `'42'`) devolve `null` — é o caso que de fato estouraria
  ao ler um campo de `null`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | readCredentials returns exactly the three fields that were saved | `admin-app/src/data/credentials-store.test.ts` | `Credentials`, `saveCredentials` e `readCredentials` sobre `setGenericPassword`/`getGenericPassword` com `JSON.stringify`/`JSON.parse` |
| 2 | returns null when nothing has been saved, without throwing | idem | guarda `if (!stored) return null` — a lib devolve `false`, não `null`, quando não há entrada |
| 3 | readCredentials returns null after saved credentials are cleared | idem | `clearCredentials` sobre `resetGenericPassword` |
| 4 | reads and writes under this app's own service, not the publisher app's | idem | a opção `{service: KEYCHAIN_SERVICE}` nas três chamadas |
| 5 | returns null when the stored entry is not valid JSON, instead of throwing | idem | `try/catch` em volta do `JSON.parse` |
| 6 | returns null when the stored JSON is missing one of the three fields | idem | `isCredentials`, portado do store do desktop |
| 7 | never writes the password to any console method, on any path | idem | nenhum — guarda negativa; validada por mutação (ver Decisões técnicas) |
| 8 | returns null when the stored JSON parses to something that is not an object | idem | a guarda `typeof value !== 'object' \|\| value === null` de `isCredentials` |

## O que foi feito

Criado o módulo de credenciais da camada Data do `admin-app/`, com as três funções pedidas e a
interface `Credentials`, mais o teste co-localizado com um fake in-memory por trás do
`react-native-keychain` mockado.

Os três ciclos que atravessaram um "já passa de primeira" foram tratados **desfazendo a
implementação prematura antes de escrever a asserção** (ciclos 4 e 8: a opção de `service` e a
guarda de tipo tinham entrado junto no GREEN de um ciclo anterior sem teste que as exigisse),
para que o RED fosse real. O ciclo 7, que é uma garantia negativa e não pode ter um RED honesto,
foi validado por mutação.

## Arquivos criados

- `admin-app/src/data/credentials-store.ts` — nome, cidade e senha da congregação no Android
  Keystore, via `react-native-keychain`.
- `admin-app/src/data/credentials-store.test.ts` — os 8 casos acima, com fake in-memory do
  keychain.

## Arquivos modificados

Nenhum. `admin-app/src/data/index.ts` foi deixado como está (`export {}`), igual a
`app/src/data/index.ts`, que nunca foi preenchido: o barril não é usado por ninguém no monorepo, e
mexer nele criaria conflito com as Tasks 04 e 06, que rodam em paralelo nesta mesma pasta.

`src/smoke.test.tsx` também foi deixado no lugar: removê-lo é o que a Task 01 pediu "na primeira
task com teste de verdade", mas esta task está escopada à camada Data, e a Task 02 (paralela) já
trouxe teste de verdade também.

## Decisões técnicas

- **Funções soltas, não uma fábrica com injeção** — o desktop usa `createCredentialsStore({...})`
  porque precisa injetar `safeStorage` e `fs` para testar; aqui o `react-native-keychain` já é
  substituído pelo mock global de `jest.setup.js`, então a fábrica não compraria nada. A forma
  segue `app/src/data/session-store.ts`, o vizinho mais próximo.
- **`service` `'territory-map-admin/credentials'`, `username` `'territory-map-admin-credentials'`**
  — o `service` é o que separa esta entrada da do publicador (`'territory-map/session'`). Os dois
  APKs foram feitos para conviver no mesmo aparelho (`com.territorymapadmin` e
  `com.territorymapapp`), então um nome compartilhado faria um app ler ou sobrescrever a entrada
  do outro. O `username` é rótulo fixo, não identificador: há uma congregação só por instalação.
- **Leitura tolerante, tudo-ou-nada** — entrada ausente, ilegível, de forma errada ou que não é
  objeto viram todas o mesmo `null`. É o mesmo comportamento do store do desktop, e a razão é a
  Task 06: `isConfigured()` responder "sim" para um registro sem senha deixaria o admin numa tela
  que não tem como se recuperar. `null` o devolve à configuração inicial, que tem.
- **Estratégia de mock** — `react-native-keychain` já vem mockado globalmente em
  `admin-app/jest.setup.js` (é módulo nativo, não roda fora do aparelho). O teste instala em cada
  `beforeEach` um fake in-memory por trás desse mock, com uma porta dos fundos `storeRaw` para
  plantar payloads que o módulo nunca escreveria — é como os casos de corrupção são exercitados sem
  fingir a lógica sob teste. Nenhum teste toca o keystore real.
- **A guarda de log foi verificada por mutação, não por RED** — "nunca logar a senha" é uma
  garantia negativa: o código nunca teve o defeito, então não existe RED honesto. Em vez de aceitar
  um teste que passa de primeira sem prova, foi inserido um `console.warn('saving',
  JSON.stringify(credentials))` no `saveCredentials`, confirmado que **só** esse teste quebrou, e o
  código restaurado. A asserção varre `log`/`info`/`warn`/`error`/`debug` e inclui de propósito o
  caminho do JSON corrompido, que é exatamente onde alguém acrescentaria um "dump do que não deu
  para parsear". O motivo é concreto: no Android um `console.*` cai no logcat.
- **A constante do `service` está escrita à mão no teste**, não importada do módulo — importá-la
  faria a asserção concordar consigo mesma, e uma troca acidental do `service` passaria sem
  ninguém notar.

## Como validar

```bash
cd admin-app
npx jest src/data/credentials-store.test.ts
npx jest --coverage --collectCoverageFrom='src/data/credentials-store.ts' src/data/credentials-store.test.ts
npx tsc --noEmit && npm run lint
```

## Resultado da validação

- `npx jest src/data/credentials-store.test.ts` → **8 testes passando**, 1 suíte.
- Suíte inteira do `admin-app` (`npx jest`) → **30 testes passando**, 3 suítes (inclui o smoke da
  Task 01 e os modelos da Task 02, que rodou em paralelo). Nada regrediu.
- Cobertura de `src/data/credentials-store.ts` → **100% de statements, 100% de branch, 100% de
  funções, 100% de linhas**.
- `npx tsc --noEmit` → sem erro. `npm run lint` → sem erro e sem warning.
- Mutação de controle (`console.warn` com a senha no `saveCredentials`) → 1 falha, e exatamente o
  teste de logging; restaurado em seguida.
