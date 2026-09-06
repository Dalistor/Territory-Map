# [0053] `HomeScreen` do admin Electron: mapa, lista de territórios, apagar, sair

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0003/` — Task 14

## Solicitação

Implementar por TDD `admin/src/renderer/screens/HomeScreen.tsx` (+ teste com fake de `window.api`,
usando o `TerritoryMap` já implementado). A tela principal do admin: mostra o nome e a cidade da
congregação depois de carregados; oferece "Novo território" (só sinaliza a intenção, sem depender do
editor real — Task 15 roda em paralelo); cada território na lista oferece "Adicionar quadra",
"Editar demarcação" e "Apagar território", com confirmação de apagar cujo texto muda conforme o
território tem ou não quadras; "Recarregar" força um novo fetch; "Sair da congregação" fica atrás de
um menu secundário (não ao lado de "Recarregar") e avisa que os dados locais somem mas nada é
removido do servidor; tocar numa quadra no mapa abre um menu com "Ver histórico", "Editar contorno ou
número" e "Apagar quadra" (apagar quadra também pede confirmação); qualquer erro de API vira mensagem
visível, nunca um crash. Escopo restrito a `HomeScreen.tsx` e seu teste.

## Contexto

Spec 0003 migra o admin de Flutter para Electron + React + TypeScript. Esta é a Task 14, a última
peça que faltava para portar `admin/lib/presentation/home_screen.dart` (Flutter, removido no início
da spec). Depende da Task 09 (`TerritoryMap.tsx`, já implementado) e da Task 07 (`ipc-contract.ts`,
já implementado). Outras telas da spec (Setup, TerritoryEditor, BlockEditor, Publishers,
BlockHistorySheet) foram implementadas por agentes em paralelo — nenhuma foi importada aqui, só
exposta via callback prop, conforme pedido.

## Critérios de aceite

1. Mostra "Territory Map" enquanto a congregação não é conhecida, e `"{name} — {city}"` assim que o
   prop `congregation` chega.
2. Mostra um estado de carregamento enquanto busca `territories.listWithBlocks()`, e some depois.
3. Erro ao carregar aparece como mensagem visível (`role="alert"`), nunca como rejeição não tratada.
4. Lista vazia mostra "Nenhum território cadastrado ainda."
5. "Novo território" chama `onNewTerritory(territories)`.
6. Cada território oferece "Adicionar quadra" (`onAddBlock(territory)`), "Editar demarcação"
   (`onEditTerritory(territory, territories)`) e "Apagar território".
7. Apagar território pede confirmação; sem quadras, mensagem simples; com quadras, avisa que as
   quadras e o histórico de trabalho delas são apagados junto (`ON DELETE CASCADE` no servidor).
   Confirmando, chama `territories.delete(id)` e recarrega a lista; cancelando, não chama a API.
8. "Recarregar" força um novo `listWithBlocks()`.
9. "Sair da congregação" fica atrás de um menu secundário ("Mais opções"), não junto de
   "Recarregar" no topo. A confirmação explica que os dados **deste computador** somem mas nada sai
   do servidor, e que será preciso digitar nome/cidade/senha de novo. Confirmando, chama
   `session.signOut()` e sinaliza `onSignedOut`.
10. Tocar numa quadra (via `onBlockTap` do `TerritoryMap`) abre um menu com "Ver histórico"
    (`onShowHistory`), "Editar contorno ou número" (`onEditBlock`) e "Apagar quadra".
11. Apagar quadra pede confirmação avisando que o histórico de trabalho vai junto; confirmando, chama
    `blocks.delete(id)` e recarrega.
12. Qualquer erro de API ao carregar, apagar território, apagar quadra ou sair aparece como mensagem
    visível, sem quebrar a tela.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|-------------------|------------------------------|
| 1 | Estado de carregamento aparece e some; `listWithBlocks` chamado uma vez | `HomeScreen.test.tsx` | `load()`, `useEffect` de montagem, estado `isLoading` |
| 1 | Título genérico antes da congregação, nome — cidade depois | `HomeScreen.test.tsx` | prop `congregation`, `title` derivado |
| 1 | Erro de carregamento vira `role="alert"` visível | `HomeScreen.test.tsx` | estado `loadError`, `errorMessage()` |
| 1 | Lista vazia mostra mensagem própria | `HomeScreen.test.tsx` | ramo vazio da lista de territórios |
| 1 | "Novo território" chama `onNewTerritory` com a lista carregada | `HomeScreen.test.tsx` | botão "Novo território" |
| 1 | "Adicionar quadra" e "Editar demarcação" por território | `HomeScreen.test.tsx` | botões por linha da lista, com `aria-label`/texto único por território |
| 2 | Apagar território sem quadras: mensagem simples, confirma, chama `delete` e recarrega | `HomeScreen.test.tsx` | `deleteTerritoryConfirmMessage`, `handleDeleteTerritory` |
| 2 | Apagar território com quadras: mensagem menciona histórico e a contagem | `HomeScreen.test.tsx` | ramo `blocks.length > 0` de `deleteTerritoryConfirmMessage` |
| 2 | Cancelar a confirmação não chama a API | `HomeScreen.test.tsx` | checagem de `window.confirm` antes de qualquer chamada |
| 2 | Erro ao apagar território vira mensagem visível | `HomeScreen.test.tsx` | estado `actionError` |
| 2 | "Recarregar" força novo fetch | `HomeScreen.test.tsx` | botão "Recarregar" chamando `load()` |
| 2 | "Sair da congregação" não fica ao lado de "Recarregar" no cabeçalho | `HomeScreen.test.tsx` | menu secundário "Mais opções", `role="menu"` |
| 2 | Confirmação de sair menciona "neste computador", servidor intacto, redigitar credenciais; confirma chama `signOut` e `onSignedOut` | `HomeScreen.test.tsx` | `SIGN_OUT_CONFIRM_MESSAGE`, `handleSignOut` |
| 2 | Cancelar sair não chama `signOut` | `HomeScreen.test.tsx` | mesmo guard de confirmação |
| 2 | Erro ao sair vira mensagem visível | `HomeScreen.test.tsx` | `actionError` reaproveitado |
| 3 | Tocar numa quadra abre o menu com as três opções | `HomeScreen.test.tsx` | estado `activeBlock`, `onBlockTap` do `TerritoryMap` |
| 3 | "Ver histórico"/"Editar contorno ou número" chamam os callbacks certos com território e quadra | `HomeScreen.test.tsx` | `onShowHistory`/`onEditBlock` |
| 3 | "Apagar quadra" pede confirmação mencionando histórico, confirma chama `blocks.delete` e recarrega | `HomeScreen.test.tsx` | `deleteBlockConfirmMessage`, `handleDeleteBlock` |
| 3 | Cancelar não chama `blocks.delete`; erro vira mensagem visível | `HomeScreen.test.tsx` | mesmos guards reaproveitados |
| 4 (cobertura) | "Recarregar" que falha mostra mensagem visível | `HomeScreen.test.tsx` | ramo de erro de `load()` isolado do da montagem |
| 4 (cobertura) | Rejeição que não é `Error` cai no texto genérico | `HomeScreen.test.tsx` | ramo `else` de `errorMessage()` |
| 4 (cobertura) | "Fechar" no menu da quadra fecha sem disparar nenhum callback | `HomeScreen.test.tsx` | botão "Fechar" do menu de quadra |

## O que foi feito

Criado `admin/src/renderer/screens/HomeScreen.tsx`: busca os territórios ao montar, mostra
carregamento/erro/lista vazia, header com título condicional à congregação, ações de
território (adicionar quadra, editar, apagar com confirmação diferenciada), "Recarregar", um menu
secundário com "Sair da congregação" (confirmação de duas partes: dado local some, servidor
intocado), o `TerritoryMap` (Task 09) desenhando o mapa, e um menu de ações por quadra acionado pelo
`onBlockTap` do mapa (ver histórico / editar / apagar com confirmação). Todas as chamadas passam por
`window.api` (a ponte IPC da Task 07); nenhuma tela filha é importada — os ganchos para as telas
futuras (editor de território, editor de quadra, histórico) são só props de callback.

## Arquivos modificados

- Nenhum — implementação isolada em arquivos novos.

## Arquivos criados

- `admin/src/renderer/screens/HomeScreen.tsx` — a tela.
- `admin/src/renderer/screens/HomeScreen.test.tsx` — 25 testes com fake de `window.api` e um stub
  local de `TerritoryMap`.

## Decisões técnicas

- **`window.confirm` para as três confirmações destrutivas.** O admin ainda não tem um componente de
  modal próprio (esta é a primeira tela renderer com testes de comportamento da spec 0003 a chegar
  neste ponto), e `window.confirm` deixa o texto de cada critério de aceite — que varia por caso —
  testável diretamente via `vi.spyOn(window, 'confirm')`, sem inventar uma API de diálogo só para
  esta task. Se uma lib de modal entrar depois, é um único ponto de troca (`runConfirmed`).
- **`TerritoryMap` real na produção, mockado no teste.** A tela importa e renderiza o componente de
  verdade (Task 09) — a instrução pedia isso explicitamente. O teste, porém, substitui
  `../map/TerritoryMap` por um stub que expõe só a prop `onBlockTap`: montar um `MapContainer`
  Leaflet de verdade em `jsdom` testaria a integração com a lib de mapa (responsabilidade da Task 09,
  que já é `Modo: direto`, sem suíte própria), não a orquestração desta tela. É o mesmo raciocínio já
  usado para o IPC real ("crie um fake de `window.api`") aplicado a um componente filho em vez de uma
  API externa.
- **`congregation` como prop, não buscado por esta tela.** O contrato de IPC (`shared/ipc-contract.ts`,
  já implementado) não tem um canal para ler a congregação de uma sessão já autenticada
  silenciosamente — só `session.configure(credentials)` retorna uma. Como a task pedia tocar somente
  em `HomeScreen.tsx`, a tela recebe `congregation?: Congregation | null` como prop (o chamador —
  provavelmente `App.tsx`, Task 13, em paralelo — decide de onde tirar isso) e cai no título genérico
  "Territory Map" enquanto não chega. **Ponto em aberto para registrar**: se `App.tsx` também não
  tiver como obter a congregação após um login silencioso (`isConfigured() === true` sem passar por
  `configure()`), falta um canal IPC (`session.getCongregation()` ou similar) — fora do escopo desta
  task, que não podia tocar em `ipc-contract.ts`/`main/`.
- **Efeito de montagem não reaproveita `load()` diretamente.** `load()` chama `setIsLoading(true)`
  sincronamente — correto quando disparado por um clique ("Recarregar", tentar de novo), mas o linter
  do projeto (`react-hooks/set-state-in-effect`, parte do `recommended` já configurado) rejeita
  setState síncrono dentro do corpo de um efeito. Como o estado inicial já é "carregando, sem erro",
  o efeito de montagem faz o fetch direto (`.then/.catch/.finally`, cada um checando uma flag
  `cancelled`) sem precisar resetar nada de início — só `load()` (usado por cliques) precisa do reset
  síncrono. Mesmo padrão de `ON DELETE CASCADE` sendo literal: o aviso da UI usa a palavra
  "histórico" porque é exatamente isso que o servidor apaga.
- **Ações por território são botões diretos, não um menu escondido.** Só "Sair da congregação"
  precisava ficar atrás de um menu secundário (a instrução foi explícita sobre isso, por ser
  destrutivo e não poder ficar ao lado de "Recarregar"). Para "Adicionar quadra"/"Editar
  demarcação"/"Apagar território" a instrução só pedia que as três ações existissem: manter como
  botões visíveis evita uma camada de indireção sem ganho de segurança correspondente.
- **Cobertura de branch não é 100%.** As duas linhas restantes (`if (!cancelled)` dentro do
  `.then`/`.catch`/`.finally` do efeito de montagem) só tomam o ramo `false` quando o componente
  desmonta antes do fetch resolver — guarda de segurança contra "setState após desmontar", não uma
  regra de negócio. Testá-la exigiria desmontar no meio de uma promise pendente e inspecionar a
  ausência de um warning do React, o que é frágil e não agrega verificação de comportamento visível.
  Deixado documentado em vez de forçado.

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/HomeScreen.test.tsx --coverage --coverage.include='src/renderer/screens/HomeScreen.tsx'
npx eslint src/renderer/screens/HomeScreen.tsx src/renderer/screens/HomeScreen.test.tsx
npm run typecheck:web
npm test   # suíte inteira do admin
```

## Resultado da validação

- `npx vitest run src/renderer/screens/HomeScreen.test.tsx`: **25 testes passando**.
- Cobertura de `HomeScreen.tsx` (v8, só este arquivo): **100% statements, 100% functions, 100%
  lines, 90.62% branches** (28/32 → 29/32 após o teste do ramo `else` de `errorMessage`; os dois
  ramos restantes são a guarda de desmontagem documentada acima).
- `npx eslint src/renderer/screens/HomeScreen.tsx src/renderer/screens/HomeScreen.test.tsx`: **sem
  erros nem avisos**.
- `npm run typecheck:web`: sem erros em `HomeScreen.tsx`/`HomeScreen.test.tsx` (os erros restantes do
  comando pertencem a `BlockHistorySheet.test.tsx` e `PublishersScreen.test.tsx`, tasks paralelas —
  não tocadas aqui).
- `npm test` (suíte inteira do admin): **237 testes passando** em 15 arquivos.
