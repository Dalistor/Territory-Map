# [0068] Cadastro de quadra continua no editor depois de salvar

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0004/` — Task 04

## Solicitação

Hoje, ao salvar uma quadra em `BlockEditorScreen`, a tela chama `onSaved?.(saved)` e depende de
`AuthenticatedApp` desmontá-la e navegar de volta para `HomeScreen` — o único jeito de "limpar" o
formulário era sair da tela. Isso obrigava o admin a voltar para a tela inicial e reabrir o editor
toda vez que queria cadastrar a próxima quadra do mesmo território. A tela deveria, em vez disso,
continuar aberta depois de salvar, mostrar uma confirmação e já estar pronta para desenhar a
próxima quadra.

## Contexto

Diagnóstico já feito na spec 0004 (não refeito aqui): a causa raiz de "salvar não deveria navegar"
é a mesma dos itens 1 e 4 da spec — `AuthenticatedApp` desmonta `HomeScreen`/o editor ao trocar de
rota. Só que a correção deste item específico (Task 04) é resolvida inteiramente dentro de
`BlockEditorScreen`, sem tocar `App.tsx`: a tela deixa de depender de ser desmontada para "limpar",
e passa a se resetar sozinha depois de um salvamento bem-sucedido.

## Critérios de aceite

Depois de `handleSave` ter sucesso (`create` ou `update`):
1. Continua chamando `onSaved?.(saved)` — quem usa a tela decide o que fazer (hoje, `App.tsx`
   decide voltar; isso não mudou).
2. Mostra uma confirmação temporária (`role="status"`, texto `Quadra {número} salva.`) que some
   sozinha depois de alguns segundos.
3. Reseta `editor` (via `usePolygonEditor`) para um anel vazio — `editor.points` fica `[]`.
4. Reseta o campo de número (`numberText`) para vazio.
5. Volta ao modo de **criar uma quadra nova** no mesmo território, mesmo que a tela tivesse sido
   aberta em modo edição (`block` definido como prop) — o "modo atual" passa a ser um estado
   próprio (`mode`), não mais derivado só da prop `block`, que nunca muda.
6. `territory` nunca muda — só a quadra sendo desenhada é que reseta.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | mostra confirmação temporária nomeando o número da quadra após criar com sucesso | `BlockEditorScreen.test.tsx` | `confirmation` state + `role="status"` no JSX |
| 2 | reseta o anel para vazio após criar com sucesso, pronto para a próxima quadra | idem | `if (editor.points.length > 0) editor.clear()` em `handleSave` |
| 3 | reseta o campo de número para vazio após criar com sucesso | idem | `setNumberText('')` em `handleSave` |
| 4 | volta ao modo de criação após salvar uma edição de quadra existente | idem | estado `mode` (`'create' \| 'edit'`), `setMode('create')` em `handleSave`, título e `editingBlock` derivados de `mode` |
| 5 | esconde a confirmação depois de alguns segundos | idem | `setTimeout(() => setConfirmation(null), CONFIRMATION_TIMEOUT_MS)` + `useEffect` de limpeza no unmount |
| 6 (refactor) | limpa um timeout de confirmação ainda pendente antes de agendar um novo, para saves consecutivos não se esconderem um ao outro cedo demais | idem | `if (confirmationTimeout.current !== null) clearTimeout(...)` antes de agendar o novo timeout |
| 7 (ajuste de teste existente) | "disables Save… while in flight" — a asserção final mudou: depois de um save bem-sucedido, Save volta a ficar **desabilitado** (porque o anel foi resetado), não habilitado | idem | nenhum código novo; teste corrigido para refletir o novo comportamento pretendido |

## O que foi feito

- `BlockEditorScreen` ganhou um estado `mode: 'create' | 'edit'`, inicializado a partir da prop
  `block` mas independente dela depois disso. `editingBlock` é derivado de `mode` (não mais direto
  da prop `block`), e é usado tanto para decidir `create` vs. `update` em `handleSave` quanto para o
  título da tela e para excluir a quadra em edição da lista de contexto (`contextRings`) — depois de
  um save, `editingBlock` vira `undefined`, então a quadra recém-salva volta a aparecer como
  contexto comum, junto com as demais.
- `handleSave`, após o sucesso da chamada à API, além de continuar chamando `onSaved?.(saved)`:
  reseta o anel (`editor.clear()` se havia pontos), o campo de número, o `mode` para `'create'`, e
  agenda a confirmação com um timeout de 4 segundos (`CONFIRMATION_TIMEOUT_MS`), limpando qualquer
  timeout anterior ainda pendente.
- Um `useEffect` de limpeza cancela o timeout pendente se a tela for desmontada antes dele disparar
  (evita `setState` em componente desmontado).
- O texto de ajuda "Em branco, o servidor usa o menor número livre." e o hint do anel passam a
  refletir `mode`/`editingBlock`, não a prop `block` original.

## Arquivos modificados

- `admin/src/renderer/screens/BlockEditorScreen.tsx` — estado `mode`, `editingBlock`, confirmação
  temporária com timeout, reset do editor e do campo de número após salvar.
- `admin/src/renderer/screens/BlockEditorScreen.test.tsx` — 6 testes novos (confirmação aparece,
  anel reseta, número reseta, volta ao modo de criação após editar, confirmação some depois de um
  tempo, timeout anterior é limpo em saves consecutivos) e 1 teste existente ajustado (a asserção
  final de "Save volta a habilitar" virou "Save continua desabilitado, porque o anel resetou").

## Decisões técnicas

- **Confirmação com timeout de 4s**, não dependente de próxima interação — critério de aceite
  permitia qualquer uma das duas abordagens; o timeout cobre o caso do admin que só olha a tela sem
  interagir de novo.
- **`editor.clear()` em vez de recriar o hook.** `usePolygonEditor` é um hook, não pode ser
  "recriado" de fora sem desmontar o componente (ex. via `key`); `clear()` já existe, é testado
  (`usePolygonEditor.test.ts`) e produz exatamente o resultado pedido (`points: []`). Só é chamado
  quando `editor.points.length > 0` porque `clear()` é um no-op quando o anel já está vazio (não
  precisa, mas evita um dispatch/snapshot de undo à toa).
- **Testar com `vi.useFakeTimers()`**, conforme o critério de aceite sugeria. Descoberta no
  caminho: `userEvent` (a lib de simulação de clique "realista") não interopera bem com fake timers
  neste projeto (React 19 + Testing Library) — mesmo com `advanceTimers`/`delay: null`
  configurados, o `await user.click(...)` trava indefinidamente sob timers falsos. A solução foi
  desenhar/digitar sob timers reais e só ativar `vi.useFakeTimers()` para o clique de salvar em si,
  usando `fireEvent.click` (dispatch síncrono, sem a maquinaria de ponteiro do `userEvent`) nesse
  trecho. Também foi necessário envolver `vi.advanceTimersByTimeAsync(...)` em `act(...)` — sem
  isso, o `setState` disparado pelo timer fake não é refletido no DOM antes da asserção seguinte
  (React 19 exige o `act()` explícito para atualizações fora do fluxo de evento do Testing Library).
- **Teste do `clearTimeout` da linha 145** (limpar um timeout de confirmação ainda pendente antes
  de agendar outro): a cobertura apontou essa linha como não exercida por nenhum teste. Em vez de
  só "cobrir por cobrir", foi escrito um teste de regressão real (dois saves em sequência, o
  segundo a 3s do primeiro, dentro da janela de 4s) que **falha visivelmente** se a linha for
  removida (confirmado manualmente: removendo o `clearTimeout`, o teste falha porque a segunda
  confirmação some cedo demais, escondida pelo timeout do primeiro save) — então a linha não é
  redundante, é o que impede saves consecutivos de se atropelarem.
- **Deixado sem teste, de propósito:** a linha `if (!canSave) return` em `handleSave` (guarda
  defensiva contra chamar a função com o botão desabilitado) — pré-existente a esta task, inatingível
  pela UI porque o próprio botão de salvar fica `disabled` nesse estado; manter como defesa em
  profundidade não motiva um teste dedicado.
- **`App.tsx` não foi tocado**, conforme pedido pela task — `onSaved` continua com a mesma
  assinatura e continua sendo chamado; quem decide navegar ou não continua sendo quem usa a tela.

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/BlockEditorScreen.test.tsx
npm run typecheck
npm run lint
npm test
```

## Resultado da validação

- `npx vitest run src/renderer/screens/BlockEditorScreen.test.tsx` — **27 testes passando** (20
  pré-existentes + 6 novos + 1 ajustado, líquido de +7 testes na suíte do arquivo).
- Cobertura de `BlockEditorScreen.tsx` (isolada, rodando só este arquivo de teste): **100% linhas,
  98.07% statements, 97.67% branch, 100% funções** — o único ramo não coberto é o guard defensivo
  pré-existente citado acima.
- `npm run typecheck` — limpo (`typecheck:node` + `typecheck:web`).
- `npm run lint` — limpo (`eslint --cache .`, sem warning).
- `npm test` (suíte inteira do admin) — **305 testes passando em 18 arquivos**, nenhuma regressão.
