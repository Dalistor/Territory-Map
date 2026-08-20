# [0148] Admin: marcar quadra como trabalhada, e o mapa colorindo pela rotação

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0009/` — Task 10

## Solicitação

> Spec 0009 — Task 10: implemente por TDD em `admin/src/renderer/screens/HomeScreen.tsx` (teste
> co-localizado já existente) e `admin/src/renderer/map/TerritoryMap.tsx`. Rode com
> `cd admin && npx vitest run`.
>
> **Marcar como trabalhada:** no modal de ações da quadra que já existe na `HomeScreen`
> (`activeBlock`), acrescente "Marcar como trabalhada". Ela abre um formulário com dois campos: um
> seletor de **publicador** (carregado por `window.api.publishers.list()`; quando o território tem
> designação aberta, o publicador designado já vem pré-selecionado […] mas continua trocável) e uma
> **data**, um `<input type="date">` com o dia de hoje como padrão. Confirmar chama
> `window.api.workLogs.markWorked(blockId, publisherId, workedAt)` e, no sucesso, recarrega a lista
> de territórios […]. Trate erro pela mesma via de `actionError` que a tela já usa.
>
> **Cor pela rotação:** `TerritoryMap` passa a chamar `blockColorCategory` com o `rotationDays` do
> território ao qual a quadra pertence, em vez do limiar fixo. Se a legenda do mapa citar "120 dias"
> em texto, ajuste para não mentir num território com rotação própria.
>
> Toque apenas em `admin/src/renderer/` (mais `index.css` se precisar de estilo); não modifique
> main, preload nem shared.

## Contexto

A spec 0009 já tinha entregue tudo abaixo desta camada: o servidor com `POST /admin/blocks/{id}/worked`
(Task 05), o `rotationDays` no modelo compartilhado e em `blockColorCategory` (Task 07) e o canal de
IPC `workLogs:markWorked` (Task 08). Faltava a única parte que o admin de fato vê — o botão que
chama esse canal e o mapa passando a rotação do território para a regra de cor, que até aqui ainda
usava o limiar fixo de 120 dias para todo mundo.

## Critérios de aceite

1. O modal de ações da quadra oferece "Marcar como trabalhada".
2. Abrir o formulário lista os publicadores da congregação.
3. O publicador designado ao território vem pré-selecionado quando existe designação aberta.
4. Sem designação aberta, nenhum publicador vem pré-selecionado.
5. A data vem preenchida com o dia de hoje.
6. Confirmar chama `workLogs.markWorked` com a quadra, o publicador escolhido e a data escolhida.
7. Cancelar não chama nada e fecha o formulário.
8. Um erro da API aparece na tela (`role="alert"`) e a lista **não** é recarregada.
9. Depois de marcar com sucesso, `territories.listWithBlocks` é chamado de novo.
10. Uma quadra trabalhada há 45 dias num território com `rotationDays: 30` é desenhada na cor de
    vencida; a mesma quadra num território sem rotação configurada, na cor de recente.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | offers "Marcar como trabalhada" in the block action menu | `admin/src/renderer/screens/HomeScreen.test.tsx` | o item de menu e o estado `isMarkingWorked` |
| 2 | lists the congregation publishers in the form it opens | idem | `openMarkWorked` chamando `publishers.list()`, o `<select>` "Publicador" |
| 3 | preselects the publisher the territory is assigned to | idem | pré-seleção por `territory.assignedUser?.id` |
| 4 | preselects nobody when the territory has no open assignment | idem | o fallback `''` e a opção "Selecione…" |
| 5 | defaults the date to today | idem | `toDateInputValue` e o `<input type="date">` "Data" |
| 6 | records the chosen publisher and the chosen date when confirmed | idem | `confirmMarkWorked` + `fromDateInputValue`, botão "Marcar" |
| 7 | records nothing when the form is cancelled | idem | `closeMarkWorked`, botão "Cancelar" |
| 8 | reloads the territories after a successful marking, so the map recolours | idem | o `await load()` dentro do `runAction` |
| 9 | shows the API error and does not reload when the marking fails | idem | a marcação passando pelo `runAction` já existente (`actionError`) |
| 10 | draws a block worked 45 days ago as overdue when the territory rotates every 30 days | `admin/src/renderer/map/TerritoryMap.test.tsx` | `blockColorCategory(block, now, territory.rotationDays)` |
| 11 | draws the same block as recent when the territory has no rotation configured | idem | (mesma linha, o ramo do fallback) |

Um teste adicional — *shows the API error when the publishers cannot be loaded* — passou de
primeira: o `catch` que ele cobre nasceu junto com o ciclo 2. Foi mantido em vez de removido porque
não duplica nenhum outro (é o único que exercita a falha do `publishers.list`) e fecha a única linha
descoberta que restava em `HomeScreen.tsx` fora da guarda defensiva.

## O que foi feito

- **`HomeScreen`**: o modal de ações da quadra ganhou "Marcar como trabalhada". Clicar troca o item
  de menu por um formulário inline com o `<select>` de publicador e o `<input type="date">`, mais
  "Marcar" e "Cancelar". Confirmar passa pelo mesmo `runAction` que as demais escritas da tela — ou
  seja, erro vira `actionError` na `role="alert"` que já existia — e, no sucesso, fecha o modal e
  chama `load()`, que é o que faz a cor da quadra no mapa acompanhar.
- **`TerritoryMap`**: a cor de cada quadra passa a sair de
  `blockColorCategory(block, now, territory.rotationDays)`. `CATEGORY_COLOR` mudou de casa para
  `blockColor.ts` (ver Decisões técnicas), e o comentário que dizia "past the 120-day threshold"
  virou "past the territory's rotation". Não há legenda em texto no mapa — a única menção aos 120
  dias era esse comentário.

## Arquivos modificados

- `admin/src/renderer/screens/HomeScreen.tsx` — o item de menu, o formulário, `openMarkWorked` /
  `confirmMarkWorked` / `closeMarkWorked` e os helpers `toDateInputValue` / `fromDateInputValue`
- `admin/src/renderer/screens/HomeScreen.test.tsx` — o `describe` "HomeScreen marking a block as worked" (7 testes)
- `admin/src/renderer/map/TerritoryMap.tsx` — a cor pela rotação do território; `CATEGORY_COLOR` movido para `blockColor.ts`
- `admin/src/renderer/map/blockColor.ts` — passou a ser o dono de `CATEGORY_COLOR`
- `admin/src/renderer/index.css` — `.block-mark-worked` e `.block-mark-worked-actions`

## Arquivos criados

- `admin/src/renderer/map/TerritoryMap.test.tsx` — o primeiro teste do componente de mapa do admin

## Decisões técnicas

- **A data não passa por `toISOString()`.** `<input type="date">` fala `YYYY-MM-DD` no fuso local, e
  `toISOString()` responde em UTC — a oeste de Greenwich, o Brasil inteiro, isso mostra o dia
  anterior. `toDateInputValue`/`fromDateInputValue` fazem a conversão pelo relógio local, e
  `fromDateInputValue` devolve a meia-noite local do dia escolhido em vez de `new Date(value)`, que
  interpretaria a string como UTC. É a mesma armadilha de fuso que `BlockHistorySheet` e
  `TerritorySettingsScreen` já evitavam com o próprio `two()`.
- **`react-leaflet` mockado no teste do mapa, `leaflet` não.** Um mapa Leaflet de verdade precisa de
  um container com layout que o jsdom não dá, e o que este teste verifica é a *decisão* do
  componente — qual cor cada quadra recebe —, não como o Leaflet pinta. Os stubs expõem as mesmas
  props que o componente passa, então a asserção continua lendo a saída renderizada. É o mesmo
  princípio que já levou `HomeScreen.test.tsx` a mockar o `TerritoryMap` inteiro.
- **`CATEGORY_COLOR` mudou para `blockColor.ts`.** O teste precisa nomear a categoria em vez de
  repetir um hex — asserção sobre `CATEGORY_COLOR.overdue` continua significativa se a paleta mudar.
  Exportá-lo de `TerritoryMap.tsx` quebrava a regra `react-refresh/only-export-components` do
  ESLint (arquivo de componente exportando constante), e `blockColor.ts` é o lugar natural: já é o
  dono da categoria, agora é o dono da cor dela.
- **O formulário substitui o item de menu em vez de abrir outro modal.** O admin não tem componente
  de modal próprio, e empilhar um segundo `position: fixed` sobre o primeiro custaria mais do que o
  ganho. O contexto ("Quadra 7 — Bairro Sul") continua no cabeçalho do modal enquanto o formulário
  está aberto.
- **Deixado sem teste de propósito:** a guarda `activeBlock === null || workedPublisherId === '' ||
  workedAtValue === ''` em `confirmMarkWorked` (linha 220, o único ponto descoberto de
  `HomeScreen.tsx`). Ela é defensiva — o botão "Marcar" fica `disabled` exatamente nessas condições,
  então não há caminho pela interface que a alcance. Testá-la exigiria chamar o callback por fora do
  componente, o que seria teste de implementação. Em `TerritoryMap.tsx`, o `ViewTracker` e o
  `eventHandlers` do marcador continuam descobertos: dependem de eventos reais do Leaflet, que é
  justamente o que o stub não tem: são o mesmo risco assumido que o `CLAUDE.md` já documenta para o
  Leaflet-Geoman.
- **A rotação não foi memoizada.** `blockColorCategory` é uma subtração e uma comparação por quadra,
  e o volume esperado é de centenas de quadras — otimizar aqui custaria mais leitura do que ganha.

## Como validar

```bash
cd admin && npx vitest run src/renderer/screens/HomeScreen.test.tsx src/renderer/map/TerritoryMap.test.tsx
```

Suíte inteira e verificações estáticas:

```bash
cd admin && npx vitest run && npx tsc --noEmit -p tsconfig.web.json && npx eslint src/renderer
```

## Resultado da validação

- `npx vitest run` → **24 arquivos, 444 testes passando** (eram 433 antes desta task).
- `npx vitest run --coverage`, nos arquivos tocados:
  - `HomeScreen.tsx` — 98,09% stmts / **85,71% branch** / 100% funcs / 98,97% linhas (única linha
    descoberta: a guarda defensiva da linha 220, justificada acima)
  - `TerritoryMap.tsx` — 79,48% stmts / 58,33% branch / 80,95% funcs / 78,78% linhas (era 0% antes:
    o arquivo não tinha teste nenhum; o que sobra descoberto são o `ViewTracker` e o clique do
    marcador, que dependem de eventos reais do Leaflet)
  - `blockColor.ts` — 100% em tudo, já pela suíte da Task 07
- `npx tsc --noEmit -p tsconfig.web.json` → sem erros.
- `npx eslint src/renderer` → 0 erros. Resta 1 warning de `prettier` em
  `TerritoryEditorScreen.tsx:103`, **pré-existente** e fora do escopo desta task (o arquivo não foi
  tocado — `git diff` nele está vazio).
