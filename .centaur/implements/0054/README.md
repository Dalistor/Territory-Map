# [0054] `PublishersScreen` no admin Electron

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0003/` — Task 17

## Solicitação

Implementar por TDD `admin/src/renderer/screens/PublishersScreen.tsx` (+ teste, fake de
`window.api.publishers.*`), portando `admin/lib/presentation/publishers_screen.dart` (Flutter,
removido — legível em `git show 12c95fe:admin/lib/presentation/publishers_screen.dart`) para React.
Lista publicadores com uma linha de status derivada de `publisherHasLiveCode`/`publisherIsPending`
(`now` injetável); "Cadastrar" pede um nome e mostra o código recém-gerado num diálogo dedicado; cada
publicador oferece "Ver código" (só com código vivo), "Gerar novo código" e "Desativar"/"Reativar" (a
tela inverte `isActive` antes de chamar `setActive`, nunca a API); qualquer erro de API vira mensagem
visível sem quebrar a tela. Escopo restrito a esse arquivo e seu teste — as demais telas da spec
(Tasks 12, 14, 15, 16, 18) foram implementadas em paralelo por outros agentes.

## Contexto

Parte da migração do admin de Flutter desktop para Electron + React + TypeScript (spec 0003), que
reverte a decisão anterior "Flutter também no admin, em vez de Electron" porque a máquina de
desenvolvimento não tem o Xcode completo para compilar `flutter build macos`. `shared/models.ts`
(Task 03) e `shared/ipc-contract.ts`/`preload` (Task 07) já existiam quando esta task começou, com os
tipos `Publisher`, `publisherHasLiveCode`, `publisherIsPending` e a interface `IpcApi['publishers']`
prontos para uso.

## Critérios de aceite

- Lista vazia mostra "Nenhum publicador cadastrado."; carregando mostra indicador, mas "Cadastrar"
  continua disponível; erro de carregamento mostra a mensagem do erro (ou uma genérica quando o erro
  não é um `Error` com `message`).
- Cada linha mostra a mensagem de status certa: revogado, código vivo, pendente sem código, ativo.
- "Cadastrar" abre um formulário de nome; "Gerar código" fica desabilitado com nome vazio/só espaços;
  submeter (clique ou Enter) chama `publishers.create(name)` e fecha o formulário imediatamente,
  independente do resultado; sucesso mostra o diálogo do código (nome, código, aviso de 24h/uso
  único/não consultável depois, ação de copiar) e recarrega a lista; falha mostra um toast e não
  inventa diálogo.
- "Ver código" só aparece com código vivo e reabre o diálogo com o código já conhecido, sem chamada
  de API.
- "Gerar novo código" chama `regenerateCode(id)`, mostra o novo código no mesmo diálogo e recarrega a
  lista; falha mostra toast e o estado anterior permanece.
- "Desativar"/"Reativar" muda de rótulo com `isActive` atual e chama `setActive(id, !isActive)` — o
  estado desejado, nunca invertido pela API; falha mostra toast e o acesso não muda.
- Copiar código usa `navigator.clipboard.writeText`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | congregação sem publicadores mostra "Nenhum publicador cadastrado." | `PublishersScreen.test.tsx` | Esqueleto do componente: `load()` via `window.api.publishers.list()`, estado vazio |
| 2 | lista pendente ainda oferece "Cadastrar"; erro de listagem mostra a mensagem do servidor | idem | Estado `loading`/`loadError`, `errorMessage()` |
| 3 | erro sem `Error.message` cai no texto genérico | idem | Fallback em `errorMessage()` |
| 4 | cada status (revogado/código vivo/pendente/ativo) | idem | `statusOf()` usando `publisherHasLiveCode`/`publisherIsPending` |
| 5 | "Gerar código" desabilitado com nome vazio/espaços; habilita com nome válido | idem | Formulário de nome com `newName.trim()` |
| 6 | código recém-minerado aparece no diálogo com os três avisos; lista recarrega | idem | `submitCreate()`, diálogo de código |
| 7 | copiar código chama `navigator.clipboard.writeText` | idem | `copyCode()` — descoberto que `userEvent.setup()` precisa vir **antes** do `Object.defineProperty(navigator, 'clipboard', …)` no teste, ou o stub do próprio `user-event` sobrescreve o fake |
| 8 | cancelar o formulário não cria nada | idem | `closeCreateForm()` |
| 9 | "Ver código" só com código vivo; ausente para expirado/revogado/já resgatado | idem | Renderização condicional do item de menu |
| 10 | regenerar mostra o novo código e recarrega | idem | `regenerate()` |
| 11 | alternância envia o oposto do estado atual, para os dois sentidos | idem | `toggleActive()` |
| 12 | falha de cadastro mostra toast e não inventa código; falha de regeneração preserva o estado anterior; falha de alternância não muda o acesso | idem | `runWrite()` (extraído no refactor) |
| 13 (cobertura) | falha sem `Error` cai no texto genérico | idem | fechou o branch descoberto em `errorMessage()` |
| 14 (cobertura) | Enter com nome válido submete; Enter com nome vazio não faz nada | idem | fechou os branches do `onKeyDown` e do guard `if (name.length === 0) return` |
| 15 (cobertura) | tela renderiza com o relógio real quando `now` não é passado | idem | fechou o branch `now ?? new Date()` |

## O que foi feito

Criado `admin/src/renderer/screens/PublishersScreen.tsx`: componente React funcional com estado local
(`useState`/`useEffect`/`useCallback`) — sem Redux/Context, seguindo o padrão dos demais componentes
já existentes no admin Electron (`TerritoryMap.tsx`, `usePolygonEditor.ts`). Toda leitura/escrita
passa por `window.api.publishers.*`, nunca por IPC direto. Erros de qualquer escrita passam por um
helper comum (`runWrite`) que os reduz a um toast; o carregamento inicial tem seu próprio tratamento
(mensagem em tela, não toast, para não competir com o resto da UI).

## Arquivos criados

- `admin/src/renderer/screens/PublishersScreen.tsx` — a tela de publicadores.
- `admin/src/renderer/screens/PublishersScreen.test.tsx` — 18 testes com React Testing Library e um
  fake de `IpcApi['publishers']`.

## Decisões técnicas

- **Fake por classe, não por objeto solto.** `FakePublishersApi implements PublishersApi` (onde
  `PublishersApi = IpcApi['publishers']`, porque TypeScript não aceita um tipo indexado direto numa
  cláusula `implements`) registra cada chamada e imita as falhas do Dart original
  (`FakePublisherRepository`), garantindo que a tela é testada contra o contrato real de
  `shared/ipc-contract.ts`, não uma forma inventada.
- **`window.api` é substituído por atribuição direta** (`(window as unknown as {...}).api = {...}`),
  não por `vi.stubGlobal('window', ...)` — substituir o `window` inteiro perderia as propriedades não
  enumeráveis do jsdom (document, location etc.) que o React Testing Library depende.
- **O formulário fecha no clique/Enter, antes da resposta do servidor** — mesmo comportamento do
  `_NameDialog` do Dart, cujo `Navigator.pop` roda de forma síncrona antes do `create()` assíncrono.
  Descoberto como teste vermelho: a primeira versão só fechava o formulário depois do sucesso, e o
  teste de erro de cadastro (`a refused registration...`) falhou porque o diálogo de nome continuava
  aberto.
- **`react-hooks/set-state-in-effect` e o `useEffect` de carregamento.** Essa regra (nova, parte do
  conjunto de lints do React Compiler, `eslint-plugin-react-hooks` 7.x) marca como erro qualquer
  `useEffect` cujo callback, mesmo só depois de um `await`, acabe chamando um `setState` — ela foi
  escrita para um modelo de busca de dados com `use()`/Suspense, que este projeto não usa. A mesma
  falha aparece em `HomeScreen.tsx` (Task 14, em paralelo, arquivo fora do escopo desta task). Como
  não era possível tocar em config nem em outro arquivo, a correção ficou local: um comentário
  `eslint-disable-next-line` explicando por que o padrão "carregar no mount, `setState` quando a
  promise resolve" é o correto aqui.
- **Cobertura: os fallbacks `accessCode ?? '—'` (três ocorrências) ficaram deliberadamente sem
  teste.** Eles protegem contra o servidor responder sucesso sem `accessCode` num código
  recém-criado/regenerado — uma violação de contrato, não um caminho real. Forçar esse branch exigiria
  uma fixture que mente sobre a resposta da API, testando a fixture e não a tela. Documentado também
  como comentário no próprio arquivo, ao lado do bloco de código que usa os três fallbacks.
- **Acessibilidade como mecanismo de teste, não decoração.** `role="dialog"`/`aria-label`,
  `role="menu"`, `role="alert"`, `role="progressbar"` foram escolhidos para que os testes consultem
  por papel/nome acessível (como o RTL recomenda), não por `data-testid` onde um papel semântico já
  bastava; `data-testid` ficou reservado para os dois lugares sem candidato semântico óbvio
  (`publisher-row-{name}`, `publisher-status`, `access-code`).

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/PublishersScreen.test.tsx   # arquivo isolado
npm test                                                        # suíte inteira do admin
npx vitest run --coverage src/renderer/screens/PublishersScreen.test.tsx
npx eslint --cache src/renderer/screens/PublishersScreen.tsx src/renderer/screens/PublishersScreen.test.tsx
npx tsc --noEmit -p tsconfig.web.json --composite false
```

## Resultado da validação

- `npx vitest run src/renderer/screens/PublishersScreen.test.tsx` → **18 testes passando**.
- `npm test` (suíte inteira do admin, incluindo os arquivos de outros agentes em paralelo) → **241
  testes passando** em 15 arquivos.
- Cobertura de `PublishersScreen.tsx` isolada: **100% statements, 100% functions, 100% lines, 93.87%
  branch** — os branches restantes são os três fallbacks `?? '—'` documentados acima como
  deliberadamente não testados.
- `eslint` nos dois arquivos: **0 erros, 0 warnings** (a única pendência, o
  `react-hooks/set-state-in-effect`, foi resolvida com o `eslint-disable` documentado; um aviso de
  formatação do Prettier foi corrigido com `prettier --write`).
- `tsc --noEmit -p tsconfig.web.json`: **sem erros nos dois arquivos** (a checagem de tipos completa
  do projeto ainda reporta erros pré-existentes em arquivos de outras tasks em andamento em paralelo,
  fora do escopo desta — `BlockHistorySheet.test.tsx`).
