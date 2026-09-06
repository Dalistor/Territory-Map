# [0080] App/Data: armazenamento seguro do token de sessão (`data/session-store.ts`)

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0005/` — Task 19

## Solicitação

Implementar por TDD `app/src/data/session-store.ts`, usando `react-native-keychain`, com
`saveSession(session: Session): Promise<void>`, `getSession(): Promise<Session | null>` e
`clearSession(): Promise<void>`. `Session` é o tipo do domínio (token + `PublisherBrief` +
`Congregation`, serializado como JSON dentro do keychain), definido pela Task 17 em
`app/src/domain/models.ts` — em paralelo, com instrução para checar se já existia antes de importar
ou declarar um tipo local mínimo equivalente e ajustar depois. Nunca guardar o código de acesso —
ele nem chega a este módulo, só o token já trocado. `react-native-keychain` mockado nos testes,
nunca o keychain real.

## Contexto

É a peça de `data/` que a Task 26 (tela de código de acesso) vai chamar depois de um `activate`
bem-sucedido, e que a Task 25 (bootstrap do app) vai ler para pular a tela de ativação quando já
existe uma sessão válida no aparelho. Como o token do app não expira, ele precisa sobreviver a
reinícios do app — `AsyncStorage` puro não é seguro o bastante para um segredo de longa duração, daí
`react-native-keychain` (Keystore no Android).

## Critérios de aceite

- `saveSession` seguido de `getSession` devolve exatamente o que foi salvo.
- `getSession` sem nada salvo devolve `null`, não lança erro.
- `clearSession` seguido de `getSession` devolve `null`.
- O código de acesso nunca é guardado por este módulo — só o token já trocado.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `getSession` sem nada salvo devolve `null`, sem lançar | `session-store.test.ts` | `getSession()` chamando `Keychain.getGenericPassword` e tratando o retorno `false` |
| 2 | `saveSession` seguido de `getSession` devolve exatamente a sessão salva | idem | `saveSession()` chamando `Keychain.setGenericPassword` com a sessão serializada em JSON |
| 3 | `clearSession` seguido de `getSession` devolve `null` | idem | `clearSession()` chamando `Keychain.resetGenericPassword` |

## O que foi feito

Criado `app/src/data/session-store.ts` com as três funções pedidas, todas usando
`react-native-keychain` sob um `service` fixo (`territory-map/session`) para não colidir com
qualquer outro uso futuro de `setGenericPassword` no app. `getSession` decodifica o JSON guardado no
campo `password` da entrada; quando `getGenericPassword` devolve `false` (nada guardado), devolve
`null` sem lançar.

Criado o teste correspondente `app/src/data/session-store.test.ts`, mockando `react-native-keychain`
inteiro (`jest.mock`) com um fake em memória por trás dos três métodos usados
(`setGenericPassword`/`getGenericPassword`/`resetGenericPassword`), reinstalado a cada teste em
`beforeEach` para isolamento — mesmo papel que `inMemoryFs()`/`fakeSafeStorage()` cumprem em
`admin/src/main/credentials-store.test.ts`.

Quando a implementação começou, `app/src/domain/models.ts` (Task 17) ainda não existia — rodando em
paralelo. Segui a instrução da task: declarei localmente um `Session`/`PublisherBrief`/`Congregation`
mínimos com os mesmos nomes de campo que a `activate()` da Task 18 usa, implementei os três ciclos
TDD contra esse tipo local, e ao final, com a Task 17 já concluída e os tipos reais coincidindo
exatamente com o que eu tinha declarado, troquei a declaração local por
`import type { Session } from '../domain/models'` — sem precisar tocar mais nada, como o comentário
`TODO` deixado no primeiro rascunho já previa. `session-store.ts` e seu teste continuam sendo os
únicos arquivos tocados.

## Arquivos criados

- `app/src/data/session-store.ts` — `saveSession`/`getSession`/`clearSession` sobre
  `react-native-keychain`.
- `app/src/data/session-store.test.ts` — 3 testes cobrindo os critérios de aceite, com
  `react-native-keychain` mockado.

## Decisões técnicas

- **`service` fixo do keychain (`territory-map/session`), não o padrão (bundle ID do app).** Escopa
  esta entrada e evita colisão com qualquer outro uso futuro de `setGenericPassword`/
  `getGenericPassword` no app (por exemplo, se um dia existir outro segredo guardado no keychain).
  `getGenericPassword`/`resetGenericPassword` recebem o mesmo `service` para mirar só esta entrada.
- **`username` fixo (`KEYCHAIN_USERNAME`), não derivado da sessão.** A API do
  `setGenericPassword` exige um par usuário/senha; como só existe uma sessão por aparelho, o
  "usuário" é só um rótulo fixo — a identidade real (quem é o publicador) vive dentro do JSON
  serializado em `password`, não no campo `username`.
- **Sem validação de forma (`isSession`) no `JSON.parse` de `getSession`.** Diferente de
  `admin/src/main/credentials-store.ts::read()`, que valida a forma do JSON decodificado porque lê
  de um arquivo em disco que pode ficar truncado/corrompido por uma escrita interrompida. Aqui a
  única escrita possível é `saveSession`, que sempre serializa um `Session` válido — nenhum dos três
  critérios de aceite exige lidar com um JSON corrompido ou de forma errada, e adicionar essa
  validação seria código de produção sem teste que o exija (regra 1 da skill). Se um caso assim
  aparecer (ex.: migração de formato do `Session` entre versões do app), é um novo ciclo TDD, não uma
  antecipação.
- **`react-native-keychain` mockado por inteiro (`jest.mock`), não por injeção de dependência.**
  Diferente de `admin/src/main/credentials-store.ts`, que recebe `safeStorage`/`fs` injetados porque
  o admin precisa trocar a implementação real explicitamente ao ligar o módulo em produção (Electron
  `main/index.ts`). Aqui `session-store.ts` é uma folha simples sem essa necessidade de fiação
  explícita — módulos React Native normalmente mockam bibliotecas nativas via `jest.mock` no nível do
  módulo, e é o padrão que o próprio ecossistema RN/Jest espera (nenhum outro teste no projeto
  precisou injetar `react-native-keychain`).
- **Fake em memória reinstalado em `beforeEach`, e não um objeto persistente entre testes.** Evita
  que um teste dependa do estado deixado por outro — cada teste que precisa de uma sessão salva
  chama `saveSession` explicitamente no seu próprio arrange, mesmo que o fake global já tivesse algo
  de um teste anterior.
- **Tipo local mínimo durante a corrida com a Task 17, depois substituído pelo import real.** A
  spec previu esse cenário de paralelismo explicitamente; documentando aqui para não parecer um
  desvio da task original.

## Como validar

```bash
cd app
npx jest src/data/session-store.test.ts   # só este arquivo
npm test                                  # suíte inteira do app
npx tsc --noEmit                          # typecheck
npx eslint src/data/session-store.ts src/data/session-store.test.ts
```

## Resultado da validação

- `npx jest src/data/session-store.test.ts`: **3 testes passando**.
- `npx jest src/data/session-store.test.ts --coverage --collectCoverageFrom='src/data/session-store.ts'`:
  **100% statements, 100% branches, 100% funções, 100% linhas** — nenhuma linha nem branch
  descoberta.
- `npm test` (suíte inteira do `app/`, incluindo os módulos das Tasks 17/18 que rodaram em
  paralelo): **21 testes passando**, 0 falhas.
- `npx tsc --noEmit`: limpo, sem erros.
- `npx eslint src/data/session-store.ts src/data/session-store.test.ts`: limpo, 0 erros e 0
  warnings.
