# [0111] Passada final de consistência visual do admin, validação completa e documentação (spec 0006, Task 08)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0006/` — Task 08

## Solicitação
Com todas as tasks anteriores da spec 0006 concluídas: (1) passada de consistência visual nos
pontos que as tasks não cobriram — `TerritoryEditorScreen` e `BlockHistorySheet` dentro do novo
shell, o `.back-bar` do `PushedScreen` alinhado ao novo visual, e resíduo de verde ou CSS morto em
`admin/src/renderer/index.css` —, só CSS/markup sem comportamento; (2) validação completa do admin
(`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`); (3) atualizar o `AGENTS.md` na
parte que descreve o admin (sidebar, tela de Designações, editor lado a lado, número real de telas
testadas); (4) registrar que o empacotamento continua manual e fora do escopo.

## Contexto
As Tasks 01–07 remodelaram o admin (primária azul, sidebar, página de Designações, Home enxuta,
editor de quadras lado a lado, Publicadores com busca), mas duas telas empurradas
(`TerritoryEditorScreen`, `BlockHistorySheet`) ainda tinham o layout antigo, o `.back-bar` usava o
botão padrão de formulário, e o CSS global carregava seletores mortos e neutros com tom esverdeado
da identidade anterior. O `AGENTS.md` ainda descrevia o admin pré-sidebar ("seis telas").

## O que foi feito
- **`TerritoryEditorScreen`** reorganizada para o mesmo shell lado a lado do editor de quadras
  (`.editor-split` / `.editor-panel` / `.editor-map`): painel compacto à esquerda (título, nome,
  toolbar, dica, erro) e mapa ocupando o resto. Markup apenas — controles, enablement e handlers
  idênticos; ganhou `role="toolbar"` na barra de botões, como o editor de quadras já tinha.
- **`BlockHistorySheet`** ganhou a estrutura `<header>`/`<main>` das demais telas roteadas (herda o
  espaçamento do chrome compartilhado em vez de ficar rente à borda), e os botões do diálogo de
  remoção foram agrupados em `.dialog-actions` como todos os outros diálogos.
- **`index.css`**:
  - `.back-bar button` ("← Voltar") virou botão discreto, no estilo dos itens da sidebar;
  - `header h2` passou a ter o mesmo peso visual de `header h1` (o histórico usa `h2`), e
    `header p` ganhou estilo próprio (o resumo da página de Designações);
  - seletores mortos `.sidebar-header h1`/`p` retargetados para `strong`/`span` — o que o
    `App.tsx` de fato renderiza (antes daqui, o cabeçalho da sidebar não recebia estilo nenhum);
  - `.editor-split` ganhou padding igual ao de `<main>`, alinhando os dois editores às telas
    roteadas;
  - resíduos de tom esverdeado neutralizados: `--color-background` `#f4f6f5` → `#f4f6f8` e o
    backdrop dos modais `rgba(17,24,21,…)` → `rgba(15,23,32,…)`;
  - comentários desatualizados corrigidos (cabeçalho do arquivo, `.territory-list`,
    `.assign-options` que dizia "HomeScreen" mas o diálogo agora vive na `DesignationsScreen`).
- **`PolygonEditorLayers.tsx`**: `VALID_COLOR` do anel em edição passou de verde `#2e7d32` para o
  azul primário `#1565c0` — a decisão da spec diz que o verde sobrevive só como status "quadra
  recente" no `TerritoryMap`, e o anel válido em verde era o último resíduo fora disso. Mudança
  puramente de cor (o vermelho de anel inválido permanece).
- **`AGENTS.md`**: a descrição do admin em "Estrutura do Projeto" agora documenta a navegação por
  sidebar (Mapa / Designações / Publicadores / Sair), a página de Designações (mapa de demarcações
  sem quadras, dirigente sobreposto, clique abre a atribuição — canais IPC da spec 0005), o editor
  lado a lado com sequência de numeração; "seis telas" virou **sete telas** + roteamento em
  `App.test.tsx` nas duas ocorrências, e a nota de "Resolvidos" passou a apontar a designação para
  a página de Designações.

### O que foi visto e **não** mudado (exigiria comportamento)
Nada bloqueante encontrado. Registro apenas: os dois diálogos de `BlockHistorySheet` e o de
Designações mantêm o botão de confirmação como botão comum (não `.button-primary`) — no histórico a
ação é destrutiva e promovê-la a primária seria uma decisão de UX, não uma limpeza.

## Arquivos modificados
- `admin/src/renderer/screens/TerritoryEditorScreen.tsx` — layout lado a lado (markup)
- `admin/src/renderer/screens/BlockHistorySheet.tsx` — `<header>`/`<main>` e `.dialog-actions` (markup)
- `admin/src/renderer/map/PolygonEditorLayers.tsx` — `VALID_COLOR` verde → azul primário
- `admin/src/renderer/index.css` — back-bar, header h2/p, sidebar-header, padding do editor-split, neutros sem tom verde, comentários
- `AGENTS.md` — admin com sidebar, Designações, editor lado a lado, sete telas testadas

## Decisões técnicas
- O `TerritoryEditorScreen` reusa as classes `.editor-split`/`.editor-panel`/`.editor-map` da
  Task 01 em vez de ganhar CSS próprio — os dois editores ficam idênticos por construção.
- Os seletores do `.sidebar-header` foram corrigidos no CSS, não no `App.tsx`: mexer no markup do
  App tocaria um arquivo que a task não lista, e o CSS é o lado que estava errado.
- A troca do `VALID_COLOR` fica no próprio `PolygonEditorLayers.tsx` (constante local): o arquivo
  documenta que não há sistema de tokens para importar, e criar um agora estaria fora do escopo.

## Empacotamento (fora do escopo — registro pedido pela task)
O empacotamento do admin (`npm run build:mac`, `build:win`, `build:linux` via `electron-builder`)
**continua manual e fora do escopo desta spec**: nenhum CI foi criado e nenhum binário foi gerado
aqui. O que esta task validou é `npm run build` (compilação electron-vite + `tsc --noEmit`), que é
o pré-requisito de qualquer empacotamento.

## Como validar
`cd admin && npm test && npm run typecheck && npm run lint && npm run build`; visualmente,
`npm run dev` e conferir: editor de território lado a lado, histórico com cabeçalho/espaçamento
iguais às outras telas, "← Voltar" discreto, anel de desenho azul enquanto válido.

## Resultado da validação
- `npm test`: **333 testes verdes** (19 arquivos) — a suíte inteira, sem nenhuma expectativa alterada.
- `npm run typecheck`: sem erros (node + web).
- `npm run lint`: sem erros e sem warnings (um warning do prettier introduzido na edição foi
  corrigido com `--fix` antes de fechar).
- `npm run build`: compila (92 módulos, bundle do renderer gerado).
