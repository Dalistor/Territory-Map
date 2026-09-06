# [0097] Admin: tela de designar publicador a um território

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0005/` — Task 15

## Solicitação

Spec 0005 — Task 15: em `admin/src/renderer/screens/HomeScreen.tsx` e seu teste
`HomeScreen.test.tsx`, adicionar ao menu "⋮" de cada território a ação "Atribuir a publicador",
que abre um diálogo (`role="dialog"`) listando os publicadores **ativos** como opções
selecionáveis, mais uma opção "Nenhum" para remover a designação. Ao confirmar, chamar
`window.api.territories.assign(territoryId, publisherId | null)`, recarregar a lista de
territórios e mostrar o publicador designado (ou nada) na linha do território.

## Contexto

`window.api.territories.assign` já existia de ponta a ponta no processo main/preload desde as
Tasks 13/14 (implementações 0093/0096) — só faltava a interface no renderer. Esta é a última peça
do lado admin da designação de território (spec 0005); o que resta na spec inteira é só o `app/`
(React Native, já em andamento) e a Task 27 de documentação final do `AGENTS.md`.

## Critérios de aceite

- Caminho feliz: abrir o diálogo, escolher um publicador ativo, confirmar → chama `assign` com o
  `id` certo, a lista recarrega e a linha do território mostra o nome desse publicador.
- Caminho feliz: escolher "Nenhum" e confirmar → chama `assign(territoryId, null)`, a linha volta
  a não mostrar publicador nenhum.
- Erro: a chamada IPC rejeita → aparece um alerta com a mensagem de erro (mesmo `role="alert"` já
  usado pelas outras ações da tela); a lista não é recarregada incorretamente.
- Borda: publicadores desativados (`isActive: false`) não aparecem como opção no diálogo.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | lista publicadores ativos como opções, mais "Nenhum", excluindo inativos | `HomeScreen.test.tsx` | Item de menu "Atribuir a publicador em X", `openAssignDialog` (busca e filtra `isActive`), o diálogo `role="dialog"` com um `<input type="radio">` por opção |
| 2 | atribui o publicador selecionado: chama `assign` com o `id`, recarrega, a linha mostra o nome | `HomeScreen.test.tsx` | `confirmAssign`, o `<span className="territory-assigned-user">` condicional na linha do território |
| 3 | escolher "Nenhum" remove a designação: chama `assign(id, null)`, a linha some | `HomeScreen.test.tsx` | Nenhum código novo — o caminho genérico do ciclo 1/2 já cobria `userId: null`; teste mantido por exercitar esse ramo explicitamente |
| 4 | mostra um alerta quando `assign` rejeita, sem recarregar incorretamente | `HomeScreen.test.tsx` | Nenhum código novo — `confirmAssign` já usava o helper de erro compartilhado |
| 5 (refactor, cobertura) | "Cancelar" fecha sem chamar `assign` | `HomeScreen.test.tsx` | Nenhum código novo — cobre o botão "Cancelar" já implementado |
| 6 (refactor, cobertura) | mostra um alerta quando `publishers.list()` falha ao abrir o diálogo | `HomeScreen.test.tsx` | Nenhum código novo — cobre o `catch` defensivo já existente em `openAssignDialog` |

## O que foi feito

- `HomeScreen.tsx`: novo item "Atribuir a publicador em {nome}" no menu "⋮" de cada território,
  entre "Editar demarcação" e "Apagar território". Abre um diálogo (`role="dialog"`,
  `aria-label` com o nome do território) com um `<input type="radio">` por publicador ativo mais
  uma opção "Nenhum", pré-selecionando quem já está designado. Confirmar chama
  `window.api.territories.assign(territoryId, userId)` e recarrega a lista; "Cancelar" fecha sem
  chamar nada. A linha do território agora mostra `Designado a {nome}` quando há um
  `assignedUser`, e nada quando não há.
- Refatorado `runConfirmed` para reaproveitar um novo helper `runAction` (try/catch +
  `actionError`), também usado por `confirmAssign` — reduz a duplicação entre a ação
  confirmada-com-`window.confirm` (apagar território/quadra, sair) e a ação sem confirmação
  (atribuir publicador, que não é destrutiva).
- `index.css`: `.assign-options label` (input e texto na mesma linha, em vez do empilhamento
  padrão de `.field`) e `.territory-assigned-user` (texto discreto entre o nome do território e o
  botão "⋮").

## Arquivos modificados

- `admin/src/renderer/screens/HomeScreen.tsx` — ação "Atribuir a publicador", diálogo, estado
  (`assignTarget`, `assignPublishers`, `selectedPublisherId`), `openAssignDialog`, `confirmAssign`,
  refactor de `runConfirmed`/`runAction`, exibição do publicador designado na linha do território.
- `admin/src/renderer/screens/HomeScreen.test.tsx` — seis novos testes cobrindo os critérios de
  aceite e a cobertura de branch do código novo; `makeApi`/`makeTerritory`/nova `makePublisher`
  ganharam suporte a `territories.assign` e `publishers.list`.
- `admin/src/renderer/index.css` — `.assign-options label` e `.territory-assigned-user`.

### Fora do escopo original, corrigido por pendência já registrada (Task 14 / implementação 0096)

A Task 14 já havia sinalizado que `IpcApi.territories.assign` (Task 13) tornou `assign`
obrigatório em toda implementação do tipo `IpcApi['territories']`, e que os fakes locais de
`window.api` em várias telas do renderer ainda não tinham o stub — quebrando
`npm run typecheck` (`tsc --noEmit` via `tsconfig.web.json`) sem exercitar nenhuma lógica de
designação de verdade. Confirmado com `npm run typecheck` antes de mexer: 17 erros
`TS2741`/`TS2322` de "Property 'assign' is missing" em quatro arquivos. Corrigido, mecanicamente
(só `assign: vi.fn()` adicionado a cada fake, sem lógica nova):

- `admin/src/renderer/screens/SetupScreen.test.tsx` — 1 fake (`fakeApi`), 1 objeto `territories`.
- `admin/src/renderer/screens/TerritoryEditorScreen.test.tsx` — 1 fake (`fakeApi`), 1 objeto
  `territories`.
- `admin/src/renderer/screens/BlockEditorScreen.test.tsx` — 1 fake (`makeApi`), 1 objeto
  `territories`.
- `admin/src/renderer/App.test.tsx` — 1 fake (`fakeApi`) com default, mais 14 overrides inline de
  `territories` espalhados pelos testes (incluindo dois com um objeto de erro
  `{ name: 'CredentialsRejectedException', ... }` aninhado, que exigiram edição manual em vez do
  script usado para o resto).

Depois da correção, `npm run typecheck` (node + web) e `npm test` (suíte inteira do admin) ficam
limpos — ver "Resultado da validação" abaixo.

## Decisões técnicas

- **Sem confirmação (`window.confirm`) para atribuir.** Diferente de apagar território/quadra ou
  sair da congregação, atribuir um publicador não é destrutivo — não apaga histórico nem exige
  digitar credenciais de novo. Por isso `confirmAssign` usa o novo `runAction` diretamente, sem
  passar por `runConfirmed`. É o mesmo raciocínio que `PublishersScreen.tsx` já aplica a
  `regenerate`/`toggleActive`, que também não confirmam antes de chamar a API.
- **Publicadores buscados ao abrir o diálogo, não mantidos em cache na tela.** `HomeScreen` nunca
  carrega publicadores para nenhum outro fim; buscar sob demanda (e filtrar `isActive` no
  renderer, não confiar em o servidor já filtrar) evita manter mais um estado global sincronizado
  e garante que a lista reflita ativações/desativações recentes feitas em `PublishersScreen`.
- **Diálogo fecha imediatamente ao confirmar, antes da resposta do servidor** — mesmo padrão que
  `submitCreate`/`regenerate` já usam em `PublishersScreen.tsx` (o `Navigator.pop` síncrono do
  antigo Dart, preservado na migração para Electron). Falha na chamada assíncrona ainda aparece
  como alerta na tela principal.
- **Exibição do publicador designado usa `screen.findByText(/designado a X/i)` nos testes, não
  `getByText('X')` exato** — `Designado a {nome}` é renderizado como dois nós de texto dentro do
  mesmo `<span>` (o literal e a interpolação), e o matcher exato de "texto" do Testing Library
  compara contra o conteúdo normalizado inteiro de um nó, não uma substring — por isso a asserção
  usa uma regex sobre a frase completa em vez de tentar isolar só o nome.
- **`openAssignDialog` tem um `try/catch` defensivo em volta de `publishers.list()`**, fora do que
  os critérios de aceite originais pediam (que só cobriam erro de `assign`), para não deixar uma
  promise rejeitada sem tratamento se o IPC falhar bem no momento de abrir o diálogo. Coberto por
  um teste adicional no ciclo de refactor (ver tabela acima), não deixado como cobertura
  "inventada" sem teste.
- **`if (assignTarget === null) return Promise.resolve()` em `confirmAssign` fica sem teste**,
  documentado aqui em vez de forçar um caso artificial: `confirmAssign` só é chamado pelo botão
  "Atribuir" dentro do próprio bloco `{assignTarget !== null && (...)}`, então o `null` nesse ponto
  é inalcançável pela UI — é só a guarda que o TypeScript exige por `assignTarget` ser um estado
  nullable. Mesmo padrão de guarda defensiva não testada que o arquivo já tinha antes desta task.

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/HomeScreen.test.tsx   # só este arquivo
npm test                                                   # suíte inteira do admin
npm run typecheck                                          # tsc --noEmit (node + web)
npm run lint                                                # eslint, sem warning
npx vitest run --coverage src/renderer/screens/HomeScreen.test.tsx   # cobertura deste arquivo
```

## Resultado da validação

- `npx vitest run src/renderer/screens/HomeScreen.test.tsx`: **36 testes passando** (30
  pré-existentes + 6 novos).
- `npm test` (suíte inteira do admin, 18 arquivos): **318 testes passando**, nenhuma regressão.
- `npm run typecheck` (`tsc --noEmit` em `tsconfig.node.json` e `tsconfig.web.json`): limpo, sem
  erros — inclui a correção dos quatro arquivos fora do escopo original citados acima.
- `npm run lint` (`eslint --cache .`): limpo, sem warning.
- Cobertura de `HomeScreen.tsx` (`vitest run --coverage`): **100% de linhas, 100% de funções,
  88.09% de branch**. Os ramos de branch não cobertos (`cancelled` no cleanup do `useEffect` de
  montagem, e o "fechar se já estiver aberto" do toggle do menu "⋮") são código pré-existente,
  não tocado por esta task; o único ramo novo desta task deixado sem teste
  (`confirmAssign`'s `assignTarget === null`) está justificado acima como inalcançável pela UI.
