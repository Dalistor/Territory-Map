# [0086] App/Presentation: tela de ativação por código (`ActivationScreen.tsx`)

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0005/` — Task 22

## Solicitação

Criar `app/src/presentation/screens/ActivationScreen.tsx`: um campo de texto para o código de
acesso e um botão "Confirmar" que chama `activate` (`data/api-client.ts`, Task 18), salva a sessão
com `saveSession` (`data/session-store.ts`, Task 19) em caso de sucesso, e navega para o dashboard
— a navegação de verdade fica para a Task 26; aqui o componente recebe `onActivated: (session:
Session) => void` por prop, para ser testável isolado. Cobrir com `@testing-library/react-native`:
caminho feliz (digitar + confirmar chama `activate`, salva a sessão, chama `onActivated`), erro
(`activate` rejeitando mostra a mesma mensagem genérica para código inválido/expirado/já usado, sem
navegar) e borda (botão "Confirmar" desabilitado com o campo vazio).

## Contexto

Primeira tela do app do publicador (spec 0005, "app do publicador em React Native com designação de
território"). O app não tem login diário — o publicador troca um código de acesso descartável
(gerado pelo admin, válido 24h, uso único) por um token permanente, e esta é a tela que faz essa
troca. `ApiClient` (Task 18, `app/src/data/api-client.ts`) e `saveSession`/`getSession`/
`clearSession` (Task 19, `app/src/data/session-store.ts`) já existiam, prontos para uso.

## Critérios de aceite

- Caminho feliz: digitar um código e confirmar chama `activate` com o código digitado, salva a
  sessão devolvida e chama `onActivated` com essa mesma sessão.
- Erro: `activate` rejeitando (código inválido, expirado ou já usado) mostra uma única mensagem
  genérica na tela — a mesma para os três casos, já que o servidor também não os diferencia — sem
  chamar `saveSession` nem `onActivated`.
- Borda: o botão "Confirmar" fica desabilitado enquanto o campo do código está vazio (inclusive
  só espaços em branco).

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|-------------------|------------------------------|
| 1 | Todos os comportamentos acima, escritos de uma vez contra o componente ainda inexistente (RED por `Cannot find module './ActivationScreen'`, depois de corrigir um RED espúrio de parse por `react-native-config` — ver Decisões técnicas) | `src/presentation/screens/ActivationScreen.test.tsx` | `ActivationScreen.tsx`: campo `TextInput`, botão `Pressable` "Confirmar", `handleConfirm` chamando `apiClient.activate` → `saveSession` → `onActivated`, captura genérica de erro |

Um único ciclo: a tela é pequena e coesa o bastante (um campo, um botão, um handler) para que
escrever os cinco testes de uma vez e implementar o componente completo em seguida não escondesse
nenhum comportamento não coberto — a cobertura de 100% branch confirma isso a posteriori (ver
"Resultado da validação").

## O que foi feito

Criado `ActivationScreen.tsx`: instancia um `ApiClient` uma vez por montagem
(`useState(() => createApiClient())`, não no escopo do módulo — ver Decisões técnicas), mantém o
texto digitado e uma mensagem de erro em estado local. `handleConfirm` chama `apiClient.activate`
com o código **aparado** (`trim()`), e em sucesso encadeia `saveSession` e `onActivated`; qualquer
rejeição (`catch` sem inspecionar o tipo do erro) limpa-se para a mesma `GENERIC_ERROR_MESSAGE`. O
botão usa `disabled={trimmedCode === ''}` — cobre tanto campo vazio quanto só espaços.

## Arquivos modificados

Nenhum (arquivos novos apenas).

## Arquivos criados

- `app/src/presentation/screens/ActivationScreen.tsx` — a tela.
- `app/src/presentation/screens/ActivationScreen.test.tsx` — os testes.

## Decisões técnicas

- **`ApiClient` é injetado via `createApiClient()` mockado no teste, não recebido por prop.** A
  task só pediu `onActivated` por prop, explicitamente para permitir testar sem navegação de
  verdade; `activate`/`saveSession` são chamados diretamente porque essa é a fronteira que a
  Arquitetura de Camadas já define como "Data" — Presentation pode chamá-la, só não pode fazer
  `fetch` bruto. O teste mocka os dois módulos (`jest.mock('../../data/api-client', ...)` e
  `jest.mock('../../data/session-store', ...)`), mesmo espírito de `fakeApi()`/`window.api` em
  `SetupScreen.test.tsx`.
- **`jest.mock` com fábrica manual, não automock.** `jest.mock('../../data/api-client')` sem
  fábrica ainda carrega o módulo real para inferir seu formato, e `api-client.ts` importa
  `react-native-config`, cujo build ESM (`export const Config = ...`) o `jest.config.js` do
  projeto (`@react-native/jest-preset` puro, sem `transformIgnorePatterns` extra) não transforma —
  isso derrubava a suíte inteira com `SyntaxError: Unexpected token 'export'` antes de qualquer
  teste rodar. `api-client.test.ts` já contorna o mesmo problema mockando `react-native-config`
  diretamente; aqui a fábrica manual (`() => ({ createApiClient: jest.fn() })`) evita precisar
  disso, porque nunca chega a carregar o arquivo de verdade.
- **`createApiClient()` instanciado dentro do componente (`useState` preguiçoso), não no escopo do
  módulo.** A primeira versão criava `const apiClient = createApiClient();` no topo do arquivo —
  isso roda na hora do `import`, antes de qualquer `beforeEach` configurar o mock com
  `mockReturnValue`, e o cliente ficava `undefined` (retorno padrão de um automock/fábrica vazia).
  Criar dentro do componente garante que a chamada só acontece quando o teste já configurou o fake.
- **`render`/`fireEvent.*` são `async` nesta versão do RTL (`@testing-library/react-native@14`) —
  todos os `await` no teste são necessários, não estilo.** Sem `await render(...)`, o `screen`
  global ainda apontava para o "nenhum render feito" (`setRenderResult` só roda depois que a
  Promise de `render` resolve), e toda consulta subsequente lançava
  `` `render` function has not been called ``. Confirmado isolando o problema num teste mínimo
  (`render(<Text>Hello</Text>)` sem `await`) antes de mexer em `ActivationScreen.tsx` — não era bug
  do componente.
- **Mensagem de erro única e genérica, capturada com `catch` sem inspecionar o erro.** Consistente
  com a regra já documentada no `AGENTS.md` para o cadastro de publicador: código inexistente,
  expirado e já usado devolvem a mesma resposta do servidor, e a tela não deve inventar uma
  diferença que o backend deliberadamente não expõe. Testado com `it.each` sobre três rejeições de
  `Error` com mensagens diferentes, todas produzindo o mesmo texto na tela.
- **Código aparado (`trim()`) antes de `activate` e para decidir se o botão está habilitado.**
  Não pedido explicitamente pela task, mas simétrico ao que `SetupScreen` já faz com nome/cidade —
  evita que um espaço acidental (comum ao digitar um código curto lido em voz alta) vire uma
  chamada fadada a falhar ou um botão habilitado com campo "vazio" na prática.

## Como validar

```bash
cd app
npx jest src/presentation/screens/ActivationScreen.test.tsx
npx jest --coverage --collectCoverageFrom='src/presentation/screens/ActivationScreen.tsx'
npx tsc --noEmit
npx eslint src/presentation/screens/ActivationScreen.tsx src/presentation/screens/ActivationScreen.test.tsx
```

## Resultado da validação

- `npx jest src/presentation/screens/ActivationScreen.test.tsx`: **6 testes, todos verdes**.
- Suíte completa do projeto (`npx jest`): **46 testes, 10 suites, todos verdes** — nenhuma
  regressão nos arquivos já existentes (`api-client.test.ts`, `session-store.test.ts`,
  `blockColor.test.ts`, `assignment.test.ts` e outros presentes no worktree no momento desta task).
- Cobertura de `ActivationScreen.tsx`: **100% linhas, 100% branches, 100% funções, 100%
  statements**.
- `npx tsc --noEmit`: sem erros.
- `npx eslint`: sem warnings nem erros nos dois arquivos tocados.
