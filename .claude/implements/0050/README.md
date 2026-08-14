# [0050] Tela de configuração inicial do admin Electron (`SetupScreen`)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0003/` — Task 12

## Solicitação

Implementar por TDD `admin/src/renderer/screens/SetupScreen.tsx` (+ teste com React Testing
Library, usando um fake de `window.api.session.configure` — não o IPC real), portando
`admin/lib/presentation/setup_screen.dart` (removido junto com o resto do admin Flutter). Campos:
nome da congregação, cidade, senha (mascarada). Prop opcional `reason?: string` mostra um aviso
acima do formulário. Critérios: campo vazio bloqueia o envio e mostra "Campo obrigatório."; envio
válido chama `configure({name, city, password})` com nome e cidade cortados de espaço e a senha
intocada; chamada pendente desabilita o botão e mostra indicador de carregamento; rejeição mostra a
mensagem de erro e reabilita o formulário; sucesso não navega sozinho.

## Contexto

Task 12 da spec 0003 (migração do admin de Flutter para Electron + React + TypeScript). Depende da
Task 07 (IPC: `shared/ipc-contract.ts`, `main/ipc-handlers.ts`, `preload/index.ts`), já concluída
(`implements/0049`). Esta é a primeira tela de fato do renderer nesta migração — as Tasks 08–11
produziram peças de mapa/editor sem tela. Também é o **primeiro teste de componente React** do
projeto (as tasks anteriores testaram hooks/funções puras, não algo renderizado com
`@testing-library/react`).

## Critérios de aceite

- Submeter com qualquer campo vazio não chama `configure` e mostra "Campo obrigatório." no(s)
  campo(s) vazio(s), inclusive quando só um dos três está vazio.
- Submeter com os três campos preenchidos chama `window.api.session.configure({name, city,
  password})` com `name`/`city` cortados de espaço (`trim`) e `password` exatamente como digitado
  (sem `trim`).
- Enquanto a chamada está pendente, o botão de submeter fica desabilitado e mostra um indicador de
  carregamento (`role="status"`).
- Se `configure` rejeitar, a mensagem de erro aparece na tela e o formulário volta a ficar
  habilitado.
- Em caso de sucesso, a tela não navega sozinha — só chama `configure`.
- A prop `reason` opcional mostra um aviso acima do formulário quando presente, e nada quando
  ausente.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | todos os 8 critérios de aceite, escritos de uma vez como a lista de casos (componente novo, sem comportamento prévio a isolar em ciclos incrementais separados) | `SetupScreen.test.tsx` | `SetupScreen.tsx`: formulário controlado, validação obrigatória por campo, chamada a `window.api.session.configure` com trim seletivo, estado de carregamento, exibição de erro, banner de `reason` |
| 2 | mensagem de erro a partir de uma rejeição em formato de objeto simples (o formato que a serialização do IPC real produz) | `SetupScreen.test.tsx` | `errorMessage()`: extrai `.message` de `Error` ou de objeto simples |
| 3 | mensagem de erro genérica quando a rejeição não carrega `message` utilizável (string vazia, ou não é objeto/Error) | `SetupScreen.test.tsx` | ramo de fallback de `errorMessage()` |

Como o componente é novo (sem código de produção prévio para o teste guiar incrementalmente), o
RED inicial foi a suíte completa dos 8 critérios de aceite falhando por `Cannot find module
'./SetupScreen'` (confirmado antes de escrever qualquer código de produção); o GREEN trouxe a
implementação completa de uma vez. Os ciclos 2 e 3 vieram depois, ao ler a cobertura de branch da
função `errorMessage` e perceber que dois ramos (mensagem em objeto simples, e ausência de
mensagem utilizável) não tinham teste — cada um ganhou um teste dedicado antes de confirmar que já
passava (a implementação já cobria o comportamento; faltava só o teste que provasse isso).

## O que foi feito

- Criado `admin/src/renderer/screens/SetupScreen.tsx`: componente controlado com três campos
  (nome, cidade, senha), validação obrigatória por campo no `submit`, chamada a
  `window.api.session.configure` com `name`/`city` cortados e `password` intocado, estado de
  `submitting` (desabilita o botão e mostra `role="status"`), estado de erro do servidor
  (`role="alert"`), e o banner de `reason` (`role="note"`, `data-testid="setup-reason"`).
- Criado `admin/src/renderer/screens/SetupScreen.test.tsx`: 11 testes cobrindo os 8 critérios de
  aceite mais os dois ramos de borda de `errorMessage`, usando um fake completo de `IpcApi`
  (`vi.fn()` em todo membro não usado, espelhando o padrão já usado em `session.test.ts` para
  `ApiClient`) — nunca o IPC real.

## Arquivos criados

- `admin/src/renderer/screens/SetupScreen.tsx` — a tela de configuração inicial.
- `admin/src/renderer/screens/SetupScreen.test.tsx` — seu teste de componente.

## Decisões técnicas

- **Validação de "obrigatório" no `submit`, não em cada `onChange`.** Mostrar erro enquanto o
  admin ainda está digitando o primeiro campo seria ruído; a validação roda uma vez, no envio, e
  fica visível até o próximo envio bem-sucedido ou até o campo deixar de estar vazio (a próxima
  tentativa de envio recalcula do zero).
- **Senha: verificação de vazio usa o valor bruto (`password === ''`), sem `trim`.** Mesma
  semântica do Dart original (`(value ?? '').isEmpty`, sem `.trim()`) — uma senha só de espaços é
  uma senha não-vazia legítima, e cortar espaço mudaria o que o admin quis digitar. Só `name`/
  `city` são cortados, tanto na validação quanto no valor enviado.
- **`errorMessage()` aceita `Error` real ou objeto simples com `message`.** O teste nunca cruza o
  IPC real (a Task pediu explicitamente um fake), então o formato exato que chega no `catch` não é
  testado aqui — só que, seja `Error` ou objeto simples, o campo `message` (quando é uma string
  não-vazia) é o que aparece na tela. Ler o JSON duplamente serializado que o IPC real produziria
  (`ipc-handlers.ts` faz `JSON.stringify(serializeError(error))` dentro de `new Error(...)`, e o
  Electron ainda prefixa a mensagem ao cruzar a borda) fica fora do escopo desta task — a Task 12
  só pediu o componente e seu teste com fake, e mexer nisso extrapolaria para `shared/` ou
  `main/ipc-handlers.ts`, fora dos arquivos autorizados. Se o formato real do erro que chega ao
  renderer virar um problema visível, é um ajuste futuro e pontual, não desta implementação.
- **Gap de configuração descoberto, não meu para consertar.** `tsconfig.web.json` não inclui
  `vitest.setup.ts` no seu `include`, então `tsc --noEmit -p tsconfig.web.json` não enxergava a
  ampliação de tipos do `@testing-library/jest-dom/vitest` (que registra `toBeInTheDocument`,
  `toBeDisabled` etc. no `Assertion` do Vitest) — o mesmo problema já aparece, de forma
  independente, nos testes de outras telas em andamento em paralelo (`PublishersScreen.test.tsx`,
  `TerritoryEditorScreen.test.tsx`). Como `SetupScreen.test.tsx` é o primeiro teste de componente
  do projeto, foi o primeiro a expor isso. Em vez de editar `tsconfig.web.json` (fora do escopo
  autorizado desta task), o próprio teste importa `@testing-library/jest-dom/vitest` diretamente —
  a ampliação de tipos do TypeScript é por programa de compilação, então isso corrige o
  `tsc --noEmit -p tsconfig.web.json` para todo arquivo incluído nesse programa, sem tocar em
  configuração compartilhada. `npm test` (Vitest em si) já funcionava sem esse ajuste, porque
  `vitest.setup.ts` roda como `setupFiles` independentemente do `tsconfig.web.json`; o problema era
  só de checagem estática via `tsc`.
- **Fake de `window.api` cobre a interface inteira, não só `session`.** Segue o padrão já
  estabelecido em `main/session.test.ts` (`fakeApiClient`): todo membro de `IpcApi` recebe
  `vi.fn()`, e só `session.configure` é sobrescrito por teste — mantém o fake honesto sobre o que
  implementa em vez de um cast solto.
- **`errors` local não é `readonly`.** A interface `FieldErrors` inicialmente tinha os três campos
  `readonly` (copiado por reflexo do padrão de tipos expostos do projeto), o que quebrava a
  atribuição incremental (`errors.name = ...`) usada para acumular os campos vazios antes de
  decidir se bloqueia o envio — `tsc` (não o Vitest, que não roda checagem de tipo) pegou isso.
  Corrigido para campos mutáveis; é um objeto de estado interno de um único `handleSubmit`, não um
  tipo exposto que precise de imutabilidade.

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/SetupScreen.test.tsx
npx vitest run src/renderer/screens/SetupScreen.test.tsx --coverage --coverage.include='src/renderer/screens/SetupScreen.tsx'
npx eslint src/renderer/screens/SetupScreen.tsx src/renderer/screens/SetupScreen.test.tsx
npx tsc --noEmit -p tsconfig.web.json --composite false   # erros restantes pertencem a outras tasks em paralelo (Publishers/BlockEditor/BlockHistory/TerritoryEditor), não a este arquivo
```

## Resultado da validação

- `npx vitest run src/renderer/screens/SetupScreen.test.tsx`: **11 testes passando**.
- Cobertura de `SetupScreen.tsx` (escopada só a este arquivo): **100% statements, 100% branch,
  100% functions, 100% lines** (36/36, 31/31, 6/6, 31/31).
- `npx eslint src/renderer/screens/SetupScreen.tsx src/renderer/screens/SetupScreen.test.tsx`:
  limpo, sem erro nem warning.
- `npx tsc --noEmit -p tsconfig.web.json --composite false`: sem erro em `SetupScreen.tsx` nem
  `SetupScreen.test.tsx`; os erros remanescentes no output pertencem a
  `PublishersScreen.test.tsx`, `TerritoryEditorScreen.test.tsx`, `BlockEditorScreen.test.tsx` e
  `BlockHistorySheet.test.tsx` — Tasks 15–18, em andamento por outros agentes em paralelo, fora do
  escopo desta task.
- `npm test` (suíte completa do projeto, rodada por último): **229 de 231 testes passando** — as 2
  falhas são em `PublishersScreen.test.tsx` (Task 17, em andamento em paralelo), nada relacionado a
  `SetupScreen`.
