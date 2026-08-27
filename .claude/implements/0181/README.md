# [0181] App admin: navegação, bootstrap e sair da congregação (`presentation/App.tsx`)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0012/` — Task 08

## Solicitação

> Spec 0012 — Task 08: Implemente por TDD `admin-app/src/presentation/App.tsx` e `App.test.tsx`.
> Leia antes `app/src/presentation/App.tsx` (o padrão de bootstrap e o `NavigationContainer` com
> native-stack deste monorepo) e `admin/src/renderer/App.tsx` (o comportamento de decidir entre
> setup e app, e o "Sair da congregação").
>
> No mount, o app consulta `session.isConfigured()`: falso leva à `SetupScreen` da Task 07;
> verdadeiro leva direto à tela de designações (que a Task 10 entrega — nesta task, use um
> placeholder mínimo e deixe a Task 10 substituí-lo). Enquanto a consulta não responde, mostre um
> estado de carregando, nunca a tela errada piscando. Exponha um "Sair da congregação" que, depois
> de confirmar num `Alert`, chama `session.signOut()` e devolve o app à `SetupScreen`; o texto da
> confirmação deve dizer que os dados são apagados **deste aparelho** e que nada é apagado no
> servidor. Trate `CredentialsRejectedError` vindo de qualquer tela devolvendo o app à
> `SetupScreen` com uma mensagem explicando que a senha provavelmente mudou no servidor.
>
> Toque apenas na camada Presentation de `admin-app/`; não modifique arquivos de outras camadas nem
> de outros projetos.

## Contexto

`admin-app/src/presentation/App.tsx` era ainda o placeholder que a Task 01 deixou para o bundle
resolver. As telas das tasks 07, 11 e 12 já existiam, mas nada as ligava: o app não decidia entre
configuração inicial e uso, não tinha "Sair da congregação" e não sabia o que fazer quando a
credencial guardada deixava de valer.

Esta task é o arquivo que junta tudo — o único do app admin que fala com
`@react-navigation/native-stack`, e o único que responde "onde este app abre?".

## Critérios de aceite

1. Com `isConfigured` falso, a `SetupScreen` aparece e a tela de designações não.
2. Com `isConfigured` verdadeiro, vai direto para as designações sem passar pela `SetupScreen`.
3. Antes de `isConfigured` resolver, nenhuma das duas aparece — só o carregando.
4. Concluir a configuração na `SetupScreen` leva às designações sem reiniciar o app.
5. "Sair da congregação" pede confirmação, com texto dizendo o que é apagado **deste aparelho** e
   que nada é removido do servidor; cancelar **não** chama `signOut`; confirmar chama `signOut` e
   volta à `SetupScreen`.
6. Um `CredentialsRejectedError` lançado pela tela de designações devolve à `SetupScreen` com a
   mensagem visível, explicando que a senha provavelmente mudou no servidor.

Acrescentados durante a execução, por serem falhas que o desenho tornava alcançáveis:

7. Montado sem prop nenhuma — como `index.js` monta —, o app constrói seus próprios colaboradores e
   funciona.
8. `isConfigured` falhando (keystore ilegível) cai na `SetupScreen` com explicação, em vez de deixar
   o app girando para sempre no carregando.
9. `signOut` falhando **não** manda o admin para a configuração inicial: as credenciais continuam no
   aparelho, e dizer o contrário seria mentira que o próximo lançamento desmente.
10. Um erro que **não** é credencial recusada (ex.: 409) não expulsa o admin da tela.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `shows only the loading state while isConfigured has not answered yet` | `admin-app/src/presentation/App.test.tsx` | `RootState` com `loading`, o efeito de bootstrap e o `ActivityIndicator` |
| 2 | `opens the setup screen when nothing is configured on this phone` | idem | estado `setup` renderizando a `SetupScreen` |
| 3 | `goes straight to the designations screen when the phone is already configured` | idem | estado `main` com `NavigationContainer` + native-stack e o placeholder de designações |
| 4 | `moves from the setup screen to the designations without restarting the app` | idem | `onConfigured` levando ao estado `main` sem reconsultar o keystore |
| 5 | `asks before signing out, saying what is erased here and what is kept on the server` | idem | `SIGN_OUT_CONFIRM_MESSAGE` e o `Alert` de confirmação |
| 6 | `cancelling the confirmation neither signs out nor leaves the designations` | idem | botão "Cancelar" com `style: 'cancel'` e sem `onPress` |
| 7 | `confirming signs out and returns to the setup screen` | idem | `SignOutButton` no `headerRight` e o handler que chama `session.signOut()` |
| 8 | `builds its own session when mounted with no props at all, the way index.js mounts it` | idem | `useDefaultDependencies` (props opcionais, `createApiClient` + `createSession` construídos uma vez) |
| 9 | `sends the admin back to setup, explaining why, when the designations screen hits a rejected credential` | idem | `withCredentialsGuard`, `DesignationsSlotProps`, `renderDesignations` e `SetupScreen.reason` |
| 10 | `falls back to setup, explaining itself, when the keystore cannot be read at all` | idem | `try/catch` no bootstrap com `STORAGE_READ_ERROR_MESSAGE` |
| 11 | `says so and stays put when signing out fails, instead of pretending it worked` | idem | `SIGN_OUT_FAILED_MESSAGE` e o `catch` do `signOut` |
| 12 | `stays on the designations when the screen fails for a reason that is not a rejected credential` | idem | (nenhum — pinta a discriminação criada no ciclo 9; ver "Decisões técnicas") |
| 13 | `withCredentialsGuard` → passa o sucesso adiante sem reportar nada | idem | (nenhum — idem) |
| 14 | `withCredentialsGuard` → reporta o `CredentialsRejectedError` e ainda relança | idem | (nenhum — idem) |
| 15 | `withCredentialsGuard` → delega ao session embrulhado tudo que não é `run` | idem | (nenhum — idem) |

## O que foi feito

`App.tsx` deixou de ser placeholder e passou a ser a raiz de navegação de verdade:

- **Bootstrap**: no mount, uma única consulta a `session.isConfigured()`. Enquanto ela não responde,
  só o carregando; falso vai para a `SetupScreen`, verdadeiro para a pilha de navegação.
- **Navegação**: `SafeAreaProvider` + `NavigationContainer` + native-stack, com uma tela
  `Designations` (hoje um placeholder, que a Task 10 substitui pela `DesignationsScreen`), no mesmo
  estilo de header azul que `app/src/presentation/App.tsx` usa.
- **Sair da congregação**: botão no `headerRight`, confirmação em `Alert` dizendo o que some deste
  aparelho e o que continua no servidor, `session.signOut()` e volta à configuração inicial.
- **Recuperação de credencial**: a `Session` entregue às telas é embrulhada por
  `withCredentialsGuard`, que reconhece o `CredentialsRejectedError` de `data/session.ts` e devolve
  o app à `SetupScreen` com a explicação — sem que nenhuma tela precise saber que isso existe.

`SetupScreen` ganhou a prop opcional `reason`, o texto que explica por que o admin está de volta
naquela tela sem ter pedido (mesma prop que a `SetupScreen` do admin desktop tem).

## Arquivos modificados

- `admin-app/src/presentation/App.tsx` — de placeholder a raiz de navegação: bootstrap, pilha
  native-stack, sair da congregação e `withCredentialsGuard`.
- `admin-app/src/presentation/screens/SetupScreen.tsx` — nova prop opcional `reason`, renderizada
  como região `alert` acima dos campos (nada mais mudou; os 14 testes existentes da tela seguem
  passando sem alteração).
- `admin-app/src/presentation/index.ts` — passa a exportar `App`, `withCredentialsGuard` e os tipos
  da camada, em vez do `export {}` vazio.

## Arquivos criados

- `admin-app/src/presentation/App.test.tsx` — 15 testes: bootstrap, transição de configuração,
  sair da congregação (pedir/cancelar/confirmar/falhar), recuperação de credencial e os testes
  diretos de `withCredentialsGuard`.

## Arquivos removidos

- `admin-app/src/smoke.test.tsx` — o teste de fumaça do scaffold, que a Task 01 mandou remover "na
  primeira task que trouxer teste de verdade". Ele afirmava o texto do placeholder antigo e, depois
  desta task, só passava por coincidência (a `SetupScreen` também mostra "Territory Map Admin"). O
  que ele provava — que `<App />` monta sem props — virou um teste explícito em `App.test.tsx`.

## Decisões técnicas

- **A tela de designações entra por uma prop (`renderDesignations`), não por import fixo.** A Task
  10 ainda não existe, e o critério de aceite 6 exige observar um erro **vindo da tela**. Um
  placeholder mudo não teria como produzi-lo. A prop tem default (o placeholder), então a Task 10
  troca uma linha; e o teste injeta uma tela falsa que faz a única coisa que toda tela deste app
  faz — `session.run(...)` — o que torna o teste independente do que a tela real vier a ser.
- **`withCredentialsGuard` embrulha só o `run`, e relança o erro.** Relançar é o que deixa a tela
  fechar o próprio estado de carregando e mostrar o que aconteceu do jeito dela; engolir deixaria a
  tela girando. `configure` não é embrulhado porque, por decisão de `data/session.ts`, ele nunca
  lança `CredentialsRejectedError` — uma tentativa fresca do admin propaga o erro do cliente como
  veio.
- **Quatro dos quinze testes passaram de primeira** (ciclos 12 a 15): eles pinam a discriminação
  criada no ciclo 9 (só `CredentialsRejectedError` expulsa; qualquer outro erro passa direto) e a
  delegação do embrulho. Não são casos novos, são a rede que impede alguém de trocar o
  `instanceof` por um `catch` largo — o refactor mais provável de quebrar essa regra.
- **O `api` é prop, e é o mesmo objeto que a `session` autentica.** `createApiClient()` guarda o
  token que `session` grava nele; se cada tela criasse o seu, as requisições sairiam sem
  `Authorization`. Por isso os dois nascem juntos num `useMemo` e o cliente desce pelo slot.
- **Props todas opcionais.** `index.js` monta com `AppRegistry.registerComponent(appName, () =>
  App)`, sem passar nada; um `session` obrigatório quebraria o app real e só o teste veria certo.
- **Sair da congregação vive no `headerRight`, não dentro da tela.** É chrome do app, não da tela de
  designações — a Task 10 não deve herdar a responsabilidade de oferecer o sair.
  `designationsOptions` é uma função de módulo, e não um objeto inline, porque um `headerRight`
  criado a cada render é um tipo de componente novo a cada render (é o que
  `react/no-unstable-nested-components` acusa, e o projeto não admite warning de lint).
- **`signOut` falhando não navega.** A alternativa — ir para a configuração inicial mesmo assim —
  diria ao admin que os dados foram apagados quando não foram, e o próximo lançamento entraria
  sozinho de novo, contradizendo o que ele acabou de ler.
- **A mensagem de credencial recusada é do `App`, não do erro.** O `CredentialsRejectedError` de
  `data/session.ts` diz "não foram aceitas… digite de novo", mas não diz **por quê**. Sem "a senha
  provavelmente mudou", o admin digitaria a mesma senha e falharia de novo.
- **Não testado de propósito:** as duas guardas `if (!cancelled)` do efeito de bootstrap (desmontar
  antes de o keystore responder) e os estilos de `pressed` do botão — são, respectivamente, uma
  proteção padrão sem efeito observável e pura aparência. É o que sobra dos 15% de branch
  descoberto.

## Como validar

```bash
cd admin-app
npx jest src/presentation/App.test.tsx     # os 15 testes desta implementação
npm test                                    # a suíte inteira do app admin
npx tsc --noEmit && npm run lint
```

## Resultado da validação

- `npx jest src/presentation/App.test.tsx` → **15 testes passando**.
- `npm test` → **12 suítes, 195 testes passando** (eram 13 suítes/196 antes: o teste de fumaça do
  scaffold foi removido).
- Cobertura de `src/presentation/App.tsx`: **100% de statements, 100% de funções, 100% de linhas,
  85% de branch** (os descobertos são as duas guardas de desmontagem e um estilo de `pressed`).
  Cobertura de `src/presentation/screens/SetupScreen.tsx` após a prop nova: 100/93.33/100/100.
- `npx tsc --noEmit` → limpo. `npm run lint` → limpo, **sem nenhum warning**.
