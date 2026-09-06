# [0176] App admin: sessão com reautenticação silenciosa (spec 0012, Task 06)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0012/` — Task 06

## Solicitação

> Spec 0012 — Task 06: Implemente por TDD `admin-app/src/data/session.ts` e `session.test.ts`.
> É o porte de `admin/src/main/session.ts` para o app admin — **leia esse arquivo primeiro** e
> mantenha o mesmo desenho: `createSession({api, store})` devolvendo `isConfigured()`,
> `configure(credentials)`, `run(action)`, `signOut()` e o getter `congregation`. Nos testes, `api`
> e `store` são fakes injetados; não instancie o cliente HTTP real nem o keychain.
>
> Exporte `CredentialsRejectedError extends Error`, lançada quando não há credencial guardada ou
> quando a guardada é recusada pelo servidor — é o sinal que a Task 08 usa para devolver o admin à
> tela de configuração inicial. As duas mensagens devem estar em português e dizer o que fazer.

## Contexto

O app admin não tem tela de login no dia a dia: o admin digita nome, cidade e senha **uma vez** e o
app autentica sozinho dali em diante. O JWT do admin dura 12 horas, então alguma coisa precisa
renová-lo sem perguntar — é esta camada. Ela é também a única que as telas chamam para escrever:
nenhuma tela conhece token, senha ou `fetch`.

A tradução que este módulo faz é entre **duas falhas que chegam iguais** a quem chama `run()`:

- o **token** vencendo (esperado, a cada 12h) → refaz o login e repete a ação **uma vez**, em
  silêncio;
- a **credencial** deixando de valer (a senha mudou no servidor, ou nunca houve configuração) →
  `CredentialsRejectedError`, que a Task 08 usa para devolver o admin à tela de configuração em vez
  de travar numa requisição que nunca vai passar.

## Critérios de aceite

- `isConfigured()` é falso sem credencial guardada e verdadeiro com.
- `configure` faz o login **antes** de gravar: login falhando não grava nada no store e o erro
  propaga como veio, **não** como `CredentialsRejectedError`.
- `configure` bem-sucedido grava as credenciais, aplica o token no cliente e expõe a congregação em
  `session.congregation`.
- O primeiro `run` sem nada autenticado faz o login a partir do store e só então executa a ação.
- `run` cuja ação lança `ApiError` 401 refaz o login e executa a ação **uma segunda vez**; se a
  segunda também der 401, o erro propaga em vez de entrar em laço infinito.
- `run` cuja ação lança erro que **não** é 401 (409, `NetworkError`) propaga direto, sem reautenticar.
- `run` sem credencial guardada lança `CredentialsRejectedError`; login com credencial guardada
  recusada com 401 também.
- `signOut` limpa o store, zera o token do cliente e faz `congregation` voltar a `null`.

## Ciclos TDD

Todos em `admin-app/src/data/session.test.ts`, contra `admin-app/src/data/session.ts`.

| # | Caso de teste | Código que passou a existir |
|---|---------------|------------------------------|
| 1 | `isConfigured` é falso quando nada está guardado | `createSession` e o esqueleto de `isConfigured` |
| 2 | `isConfigured` é verdadeiro com credencial guardada | `isConfigured` passa a consultar `store.read()` |
| 3 | `configure` propaga a falha de login e não grava nada | `configure` chamando `api.login` **antes** de `store.write` |
| 4 | `configure` bem-sucedido grava, aplica o token e expõe a congregação | `api.setToken` + o estado `congregation` |
| 5 | `run` sem credencial lança `CredentialsRejectedError` sem chamar a API | `CredentialsRejectedError`, `run`, `signInFromStore` |
| 6 | `run` faz o login do store **antes** de executar a ação | (verde de saída — ver "Decisões técnicas") |
| 7 | O segundo `run` não refaz o login; `configure` já deixa autenticado | o estado `authenticated` |
| 8 | Login com credencial guardada recusado com 401 vira `CredentialsRejectedError` | `try/catch` em `signInFromStore` |
| 9 | Falha de login que não é 401 (`NetworkError`) propaga como veio | `isUnauthorizedError` |
| 10 | Ação com 401 refaz o login e roda uma segunda vez | o `try/catch` de repetição em `run` |
| 11 | 409 e `NetworkError` na ação propagam sem repetir (`it.each`) | a checagem `isUnauthorizedError` dentro do `catch` |
| 12 | Segundo 401 propaga; o retry não vira laço (dois testes) | (verdes de saída — guardas de regressão) |
| 13 | `signOut` limpa store, token e congregação | `signOut` |
| 14 | Depois de `signOut`, o próximo `run` refaz o login; `clear` falhando propaga | `authenticated = false` no `signOut` |
| 15 | `credentialsStore` faz ida e volta pelo keystore e limpa | o adaptador `credentialsStore` |

## O que foi feito

`createSession({api, store})` devolve `isConfigured`, `configure`, `run`, `signOut` e o getter
`congregation`, com dois estados internos (`authenticated` e `congregation`) e a função privada
`signInFromStore`, que é o único caminho que lê a credencial guardada — `configure` nunca passa por
ela, porque loga com o que acabou de receber, não com o que está no keystore.

Além do que a task pediu, o módulo exporta:

- `CredentialsStore` — a interface (`read`/`write`/`clear`) que a sessão consome;
- `credentialsStore` — o adaptador que liga as três funções soltas da Task 05 a essa interface, para
  a Task 08 poder montar `createSession({api: createApiClient(), store: credentialsStore})`.

O barril `admin-app/src/data/index.ts`, que estava com um `export {}` de placeholder, passou a
reexportar os três módulos da camada.

## Arquivos modificados

- `admin-app/src/data/index.ts` — deixou de ser placeholder e passou a reexportar `api-client`,
  `credentials-store` e `session`.

## Arquivos criados

- `admin-app/src/data/session.ts` — a sessão: login automático, repetição única no 401,
  `CredentialsRejectedError` e o adaptador `credentialsStore`.
- `admin-app/src/data/session.test.ts` — 19 testes, com `api` e `store` fakes.

## Decisões técnicas

**A interface `CredentialsStore` vive aqui, não em `credentials-store.ts`.** A Task 05 entregou três
funções soltas (`saveCredentials`/`readCredentials`/`clearCredentials`), enquanto o desenho portado
do desktop pede um objeto injetável — é o que permite ao teste passar um fake sem nenhum keychain.
Em vez de reescrever o arquivo da Task 05, a interface e o adaptador `credentialsStore` ficam neste
módulo: o consumidor da abstração é quem a declara, e a Task 05 continua intacta.

**A mensagem de `configure` não é traduzida, a de `run` é.** Um login recusado dentro de `configure`
é a tentativa fresca do admin — ele está com os três campos na tela e o que ele precisa ver é o que
o servidor disse. Já uma credencial *guardada* recusada é outra história: quem chama `run` é uma
tela de listagem que não tem o que fazer com "credenciais inválidas", e por isso ali o erro é
traduzido para `CredentialsRejectedError`, com uma mensagem em português dizendo para digitar os
dados novamente. É a assimetria que a task pediu, e o teste do ciclo 3 a fixa.

**Só o 401 dispara reautenticação** (`isUnauthorizedError`). Um `NetworkError` sobre uma conexão
morta reautenticaria para falhar de novo, e ainda culparia a senha do admin por um problema de
sinal; um 409 é o servidor recusando a operação pelo mérito dela, e repetir uma **escrita** que na
verdade passou seria pior que devolver o erro. Os ciclos 9 e 11 cobrem os dois.

**A repetição é uma tentativa, não um laço.** Os dois testes do ciclo 12 nasceram verdes, porque a
implementação mínima do ciclo 10 já tinha a forma certa. Foram mantidos como guarda de regressão e
**verificados**: trocando o `try/catch` por um `for (;;)` equivalente, a suíte deixa de terminar (o
processo foi morto em 30s), que é exatamente o que eles existem para impedir — uma sessão girando
contra um servidor que nunca vai dizer sim, com a tela travada num spinner. O teste do ciclo 6
também nasceu verde, pelo mesmo motivo (a ordem já vinha do `run` mínimo do ciclo 5); ficou porque
suas asserções — credenciais repassadas, token aplicado, congregação exposta — são as primeiras a
cobrir esse caminho.

**Estratégia de mock:** `api` e `store` são fakes construídos no próprio arquivo de teste, e
nenhum teste toca rede ou keystore. A exceção deliberada é o `describe('credentialsStore')`, que
roda contra o mock global de `react-native-keychain` do `jest.setup.js`: o que vale checar ali é que
os três membros estão de fato ligados ao módulo do keystore, e um fake do próprio adaptador
esconderia justamente o erro de fiação que o teste procura.

**Nada de relógio nem de temporizador.** A expiração do JWT não é calculada aqui — é o 401 do
servidor que a anuncia. Por isso não existe data nos testes, e nenhum deles é sensível a tempo.

## Como validar

```bash
cd admin-app
npx jest src/data/session.test.ts
npx jest --coverage --collectCoverageFrom='src/data/session.ts' src/data/session.test.ts
npm test && npx tsc --noEmit && npm run lint
```

## Resultado da validação

- `npx jest src/data/session.test.ts` → **19 testes passando**, 1 suíte.
- Cobertura de `src/data/session.ts` → **100% statements, 100% branch, 100% funcs, 100% lines**,
  nenhuma linha descoberta.
- `npm test` (suíte inteira de `admin-app/`) → **126 testes passando**, 9 suítes, nada regrediu.
- `npx tsc --noEmit` → sem erros.
- `npm run lint` → sem erros e sem warnings.
