# [0135] Admin: a seção "Histórico" na sidebar

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0008/` — Task 08

## Solicitação
> Spec 0008 — Task 08: Implemente por TDD em `admin/src/renderer/App.tsx` e `App.test.tsx`.
> Acrescente a seção **"Histórico"** à sidebar, entre "Designações" e "Publicadores", seguindo
> exatamente o padrão das que já existem (`sectionButton`, rota nova `history` no tipo `Route`,
> `is-active` + `aria-current="page"` quando ativa), renderizando a `HistoryScreen` (Task 07) na
> área de conteúdo. […] O fake de `window.api` do `App.test.tsx` vai precisar de
> `assignments.listAll` — acrescente.

## Contexto
A `HistoryScreen` nasceu na Task 07 (implementação 0134) sem nenhum caminho de navegação até ela:
existia o arquivo e o teste, mas nenhuma tela do app a montava. Esta task é o último fio — a
entrada na sidebar que torna a página alcançável. É também a task que fecha o `npm run typecheck`,
que vinha com exatamente um erro desde a Task 05: o fake de `window.api` do `App.test.tsx` não
implementava o `assignments.listAll` acrescentado ao `IpcApi`.

## Critérios de aceite
- A sidebar mostra quatro seções, e "Histórico" aparece **entre** "Designações" e "Publicadores".
- Clicar "Histórico" renderiza a `HistoryScreen` na área de conteúdo.
- A seção ativa recebe `is-active` e `aria-current="page"`; as outras não.
- As demais seções continuam funcionando — voltar por "Mapa" desmonta o histórico e traz a Home.
- O fake de `window.api` satisfaz o `IpcApi` inteiro (inclui `assignments.listAll`).

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `shows the sidebar with the congregation, the four sections, and "Mapa" initially active` (adaptado: passou a exigir "Histórico" sem `aria-current`) | `admin/src/renderer/App.test.tsx` | `sectionButton('history', 'Histórico')` na `sidebar-nav`, `'history'` no tipo `Section` e em `sectionOf` |
| 2 | `places "Histórico" between "Designações" e "Publicadores"` | `admin/src/renderer/App.test.tsx` | A posição do botão entre os dois vizinhos |
| 3 | `shows the History screen when "Histórico" is clicked, and "Mapa" returns home` | `admin/src/renderer/App.test.tsx` | Rota `{ kind: 'history' }` no tipo `Route` e o `case 'history'` de `renderRoute` devolvendo `<HistoryScreen />` |

Os três ciclos foram escritos juntos como um bloco RED (as três falhas eram a mesma ausência: o
botão "Histórico"), verificados vermelhos pelo motivo certo — `getByRole('button', { name:
'Histórico' })` não encontrando nada, não erro de import ou setup — e ficaram verdes com a
mudança acima.

## O que foi feito
- `App.tsx`: rota `history` no tipo `Route`, `'history'` no tipo `Section` e no `switch` de
  `sectionOf`, o `sectionButton('history', 'Histórico')` entre Designações e Publicadores, o
  `case 'history'` renderizando `<HistoryScreen />`, e os comentários de cabeçalho atualizados de
  "três seções" para "quatro".
- `App.test.tsx`: `assignments.listAll` no `fakeApi()`, os dois testes novos, a adaptação do teste
  que enumerava as seções — e a correção de uma condição de corrida descrita abaixo.

## Arquivos modificados
- `admin/src/renderer/App.tsx` — a seção Histórico na sidebar e sua rota
- `admin/src/renderer/App.test.tsx` — fake completo, testes da seção nova, `cleanup()` no `afterEach`

## Decisões técnicas

**`history` é uma seção, não uma tela empurrada — e é distinta de `block-history`.** O tipo `Route`
já tinha um `block-history` (o histórico de trabalho de *uma quadra*, aberto a partir da Home com
"← Voltar"). São coisas diferentes: a nova `history` é o histórico de *designações* da congregação
inteira, uma seção permanente da sidebar como Designações e Publicadores. Os dois nomes convivem
porque os dois conceitos convivem; renomear `block-history` estaria fora do escopo desta task.

**Um teste separado só para a ordem dos botões.** Poderia ter virado uma asserção a mais no teste
que já lista as seções, mas a ordem foi um requisito explícito da spec ("entre Designações e
Publicadores") e é a única coisa que um `getByRole` por nome nunca pegaria — merecia um teste com
nome próprio, que falha dizendo exatamente o que quebrou.

**A corrida que o `cleanup()` conserta.** A suíte completa passou a falhar de forma intermitente,
em um teste diferente a cada execução, sempre com `Cannot read properties of undefined (reading
'territories')` vindo do efeito de mount do `HomeScreen`. A causa é de ordenação de hooks: a
limpeza automática do React Testing Library é registrada quando o arquivo importa
`@testing-library/react`, portanto **antes** do `afterEach` do próprio arquivo — e o Vitest desfaz
`afterEach` na ordem inversa do registro, então o `vi.unstubAllGlobals()` do arquivo rodava
*primeiro*, com os componentes ainda montados. Uma promessa de boot ainda em voo então resolvia,
montava o `HomeScreen` e encontrava `window.api` já removido. O defeito é anterior a esta task
(latente, dependente de timing); os testes novos apenas mudaram o escalonamento o bastante para
expô-lo sob carga. A correção é chamar `cleanup()` explicitamente como primeira linha do
`afterEach`, desmontando antes de desestubar. Foi preferida a afrouxar ou remover o teste que
falhava — o teste estava certo, o ambiente é que estava errado.

**Nada de `index.css`.** A seção nova reaproveita `sidebar-nav`/`is-active`, que já estilizam as
outras três; não houve regra de estilo a acrescentar.

## Como validar
```bash
cd admin
npx vitest run src/renderer/App.test.tsx   # os testes desta implementação
npm test                                    # a suíte inteira
npm run typecheck
npm run lint
```

## Resultado da validação
- `npx vitest run src/renderer/App.test.tsx` → **23 testes passando** (eram 20).
- `npm test` → **393 testes passando**, 22 arquivos, zero falhas. Executado **três vezes seguidas**
  para provar que a intermitência descrita acima acabou (antes do `cleanup()`, falhava em 2 de 3
  execuções, num teste diferente a cada vez).
- Cobertura de `App.tsx` medida só com este arquivo de teste: **95,4% de statements, 88,88% de
  branch, 97,46% de linha**. As duas linhas descobertas (315 e 318) são callbacks inline passados
  ao `HomeScreen` (`onAddBlock`, `onEditBlock`), lacuna pré-existente e alheia a esta mudança; todo
  o caminho da seção Histórico está coberto.
- `npm run typecheck` → **limpo**, nos dois projetos (`node` e `web`). Era o último erro pendente,
  como a task previa.
- `npm run lint` → **0 erros**. Resta 1 warning de formatação em
  `src/renderer/screens/TerritoryEditorScreen.tsx:103`, confirmado **pré-existente** (reproduzido
  com as mudanças desta task guardadas em `git stash`) e num arquivo fora do escopo desta task.
