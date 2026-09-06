# [0056] Roteamento raiz do admin Electron (`App.tsx`) e canal IPC `session:getCongregation`

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0003/` — Task 13

## Solicitação

Implementar por TDD `admin/src/renderer/App.tsx` (+ teste com um fake de `window.api`): ao montar,
chama `window.api.session.isConfigured()`; enquanto pendente mostra um estado de carregamento; se
resolve `false`, renderiza `SetupScreen` sem `reason`; se rejeita (falha ao ler o armazenamento),
renderiza `SetupScreen` com uma mensagem própria; se resolve `true`, tenta carregar os territórios
(`window.api.territories.listWithBlocks()`) para decidir se `HomeScreen` é exibida; se esse
carregamento falhar com um erro cujo `name` é `'CredentialsRejectedException'`, cai de volta para
`SetupScreen` com a mensagem desse erro como `reason`; qualquer outro erro de carregamento não deve
acionar esse fallback — `HomeScreen` trata isso sozinha.

Adicionalmente, foi autorizada a extensão descoberta durante a Task 14: não existia canal IPC para
obter a congregação de uma sessão já configurada (`session:configure` só a devolve no primeiro
login). Foi adicionado o canal aditivo `session:getCongregation`, devolvendo `session.congregation`.

## Contexto

`App.tsx` é o equivalente a `_Root`/`_Authenticated` do antigo `admin/lib/main.dart` (Flutter,
removido nesta migração para Electron): o componente que decide, a cada abertura do app, se o
admin vê a tela de configuração ou o app autenticado. Sem ele, `SetupScreen` e `HomeScreen` (já
implementadas nas Tasks 12 e 14) ficavam sem nada que as orquestrasse.

## Critérios de aceite

1. Enquanto `session.isConfigured()` está pendente, mostra um estado de carregamento (`role="status"`).
2. `isConfigured()` resolve `false` → `SetupScreen` sem `reason`.
3. `isConfigured()` rejeita → `SetupScreen` com `reason` = "Não foi possível ler os dados guardados
   neste computador."
4. `isConfigured()` resolve `true` → chama `territories.listWithBlocks()`:
   - sucesso → chama `session.getCongregation()` e renderiza `HomeScreen` com essa congregação;
   - falha com `error.name === 'CredentialsRejectedException'` → `SetupScreen` com a mensagem desse
     erro como `reason`;
   - falha com qualquer outro erro → renderiza `HomeScreen` mesmo assim (ela refaz o carregamento
     e mostra o erro do jeito dela); `session.getCongregation()` não é chamado nesse caminho.
5. (Extensão de escopo, justificada pelo próprio objetivo "roteamento raiz — decisão entre tela de
   configuração e app autenticado") Depois de `HomeScreen` sinalizar `onSignedOut`, `App` volta para
   `SetupScreen` sem `reason` — sem isso a tela autenticada continuaria visível com a sessão local já
   limpa.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|-------------------|------------------------------|
| 1 | mostra carregamento enquanto `isConfigured` está pendente | `App.test.tsx` | Estado inicial `{status:'loading'}` e o `<p role="status">` |
| 2 | `SetupScreen` sem `reason` quando `isConfigured` resolve `false` | `App.test.tsx` | Ramo `!isConfigured` |
| 3 | `SetupScreen` com a mensagem padrão quando `isConfigured` rejeita | `App.test.tsx` | `catch` do primeiro `await`, `STORAGE_READ_ERROR_MESSAGE` |
| 4 | `HomeScreen` com a congregação recuperada quando tudo dá certo | `App.test.tsx` | `territories.listWithBlocks()` + `session.getCongregation()` no caminho feliz |
| 5 | fallback para `SetupScreen` com a mensagem do erro quando `CredentialsRejectedException` (objeto plano) | `App.test.tsx` | `errorName`/`errorMessage`, comparação com `CREDENTIALS_REJECTED_NAME` |
| 6 | mesmo fallback também com uma instância real de `Error` | `App.test.tsx` | Ramo `error instanceof Error` de `errorName`/`errorMessage` |
| 7 | `HomeScreen` (sem fallback) quando o erro não é `CredentialsRejectedException` | `App.test.tsx` | Ramo `else` do `catch` de `listWithBlocks` |
| 8 | `session.getCongregation` não é chamado quando o carregamento falha | `App.test.tsx` | Confirma que o `try/catch` de `getCongregation` só roda após sucesso |
| 9 | volta para `SetupScreen` depois de sair da congregação pela `HomeScreen` | `App.test.tsx` | `onSignedOut={() => setState({status:'setup'})}` |
| 10 | mensagem padrão quando o erro de credenciais não carrega `message` | `App.test.tsx` | Fallback final de `errorMessage` |
| 11 | trata rejeição sem `name` utilizável como problema da `HomeScreen` | `App.test.tsx` | Fallback final de `errorName` |

Cada teste foi verificado por mutação manual (comentar/neutralizar o trecho de produção
correspondente e confirmar que o teste específico falha) antes da validação final, já que a
implementação inicial nasceu completa a partir dos critérios de aceite bem definidos da task —
prática mais leve que o red-green-refactor estrito por ser uma mudança pequena e bem especificada
(ver `prefer-lightweight-process-for-small-changes` na memória do usuário).

## O que foi feito

- Criado `admin/src/renderer/App.tsx`: componente raiz que decide entre `SetupScreen` e `HomeScreen`
  com base em `session.isConfigured()` e um carregamento de prova de `territories.listWithBlocks()`.
- Criado `admin/src/renderer/App.test.tsx` com 11 testes cobrindo os critérios de aceite e as duas
  formas de erro que cruzam a fronteira IPC (objeto plano `SerializedIpcError`-shaped e instância
  real de `Error`).
- Estendido o contrato IPC com o canal aditivo `session:getCongregation` (sem alterar nenhum canal
  existente), para fechar a lacuna descoberta na Task 14: não havia como obter a congregação de uma
  sessão já configurada (só a de um login recém-feito).

## Arquivos modificados

- `admin/src/shared/ipc-contract.ts` — canal `sessionGetCongregation: 'session:getCongregation'`
  em `IPC_CHANNELS`; método `getCongregation(): Promise<Congregation | null>` em `IpcApi.session`.
- `admin/src/main/ipc-handlers.ts` — registra `ipcMain.handle` para o novo canal, devolvendo
  `session.congregation` (leitura de estado local, sem `session.run()`, já que não é chamada de
  API).
- `admin/src/preload/index.ts` — expõe `getCongregation` em `window.api.session` via
  `ipcRenderer.invoke`.
- `admin/src/renderer/screens/SetupScreen.test.tsx`,
  `admin/src/renderer/screens/HomeScreen.test.tsx`,
  `admin/src/renderer/screens/TerritoryEditorScreen.test.tsx`,
  `admin/src/renderer/screens/BlockEditorScreen.test.tsx` — os fakes de `IpcApi` construídos como
  objeto totalmente tipado precisaram ganhar `getCongregation: vi.fn()` no `session` fake, porque o
  novo membro do contrato é obrigatório e quebrava `npm run typecheck` sem isso. Mudança mecânica,
  sem alterar nenhum teste existente. `BlockHistorySheet.test.tsx` e `PublishersScreen.test.tsx` não
  precisaram de ajuste — usam `as unknown as IpcApi`, que não é verificado estruturalmente.

## Arquivos criados

- `admin/src/renderer/App.tsx` — o roteamento raiz.
- `admin/src/renderer/App.test.tsx` — os 11 testes.

## Decisões técnicas

- **Estado como união discriminada** (`RootState`), não três `useState` soltos — evita estados
  impossíveis como "carregando com `reason` definido".
- **`errorName`/`errorMessage` fazem duck-typing** sobre `unknown`, aceitando tanto uma instância
  real de `Error` quanto um objeto plano `{name, message}` — o mesmo padrão que `SetupScreen.tsx`
  (Task 12) já usa para `errorMessage`, porque `ipcRenderer.invoke` nem sempre entrega uma instância
  real de `Error` (nos testes que fazem fake de `window.api` diretamente, e potencialmente através da
  fronteira real do IPC, dependendo de como o Electron reconstrói o erro do outro lado).
- **`session.getCongregation()` só é chamado depois de `listWithBlocks()` ter sucesso** — exatamente
  como pedido: nos dois caminhos de falha (erro de credenciais ou qualquer outro erro), a congregação
  fica `null`, e é `HomeScreen` quem decide o que mostrar nesse caso (ela já cai para o título
  genérico "Territory Map" quando `congregation` é `null`).
- **Falha de `getCongregation()` não é tratada como fatal.** É uma leitura de estado local do
  processo principal (não uma chamada de rede); se por algum motivo rejeitar, o código cai para
  `congregation: null` em vez de mandar o admin de volta para `SetupScreen` por um problema cosmético
  no cabeçalho.
- **`onSignedOut` da `HomeScreen` foi conectado para voltar a `SetupScreen`.** Isso não está listado
  letra por letra nos critérios de aceite do prompt da task, mas está dentro do objetivo declarado da
  Task 13 ("a decisão entre tela de configuração e o app autenticado", portando `_Root`/
  `_Authenticated"), e sem essa fiação a tela autenticada continuaria visível com a sessão local já
  limpa depois de "Sair da congregação". Coberto por teste próprio, e verificado por mutação (ver
  seção de validação).
- **Não foi resolvida a transição automática após um primeiro `configure()` bem-sucedido dentro de
  `SetupScreen`.** `SetupScreenProps` (Task 12, não editável nesta task) não expõe nenhum callback de
  sucesso — só chama `window.api.session.configure(...)` e deixa "o chamador decidir o que acontece
  depois", mas sem um gancho para o chamador saber que aconteceu. Diferente da lacuna do
  `session:getCongregation` (explicitamente autorizada para esta task), esta não foi autorizada e
  exigiria editar `SetupScreen.tsx`, que a instrução da task proíbe. Fica registrado como ponto em
  aberto genuíno: hoje, depois do primeiro cadastro bem-sucedido, o admin precisa reabrir o app para
  `App.tsx` rodar `isConfigured()` de novo e mostrar `HomeScreen`.
- **Verificação por mutação em vez de red-green estrito por caso.** Como os critérios de aceite da
  task já estavam bem definidos e a mudança é pequena, a implementação nasceu completa a partir deles
  e cada teste foi confirmado depois, comentando/neutralizando o trecho de produção correspondente e
  checando que exatamente aquele teste (e só ele) falhava. Prática mais leve, alinhada à preferência
  registrada do usuário de calibrar o rigor pelo tamanho da tarefa.

## Como validar

```bash
cd admin
npx vitest run src/renderer/App.test.tsx   # só este arquivo
npm test                                    # suíte completa
npm run lint
npm run typecheck
npm run build
npx vitest run --coverage src/renderer/App.test.tsx   # cobertura de App.tsx
```

## Resultado da validação

- `npx vitest run src/renderer/App.test.tsx` → **11 testes passando**.
- `npm test` (suíte completa do admin) → **262 testes passando em 16 arquivos** (baseline antes desta
  task: 251 testes em 15 arquivos).
- `npm run lint` → limpo, sem erros nem avisos.
- `npm run typecheck` (`typecheck:node` + `typecheck:web`) → limpo.
- `npm run build` (`electron-vite build`) → build de `main`, `preload` e `renderer` concluído sem
  erro.
- Cobertura de `admin/src/renderer/App.tsx` (`vitest run --coverage`): **100% linhas, 98%
  statements, 100% funções, 83.33% branches**. O único ramo não coberto é a checagem defensiva de que
  um campo `name` presente num objeto de erro é de fato uma `string` (linha 43 de `App.tsx`) — não
  há, nos dois formatos reais de erro que cruzam a fronteira IPC (instância de `Error`, ou o objeto
  plano `SerializedIpcError`), um jeito de produzir um `name` presente e não-string; o ramo existe só
  como defesa contra um objeto malformado, e escrever um teste sintético só para forçá-lo não
  agregaria confiança real — decisão documentada aqui em vez de inventar cobertura.
