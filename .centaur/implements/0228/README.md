# [0228] Gramática visual das telas auxiliares do desktop

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 13

## Solicitação

> Migre as telas desktop restantes para os tokens e contratos aprovados, preservando o mapa como
> workbench, ações destrutivas, editores lado a lado e diálogos acessíveis.

## Contexto

As consultas principais já adotam a composição aprovada. As rotas de configuração, desenho e
histórico precisavam da mesma hierarquia visual para não parecerem um produto separado.

## O que foi feito

- Aplicou superfícies, cabeçalhos, cartões, ações secundárias e zonas destrutivas compartilhadas
  ao setup, mapa, editores, configurações e histórico de quadra.
- Manteve o mapa como área principal de trabalho e preservou uma única rolagem por painel ou
  superfície de tabela.
- Diferenciou visualmente remoções e registros de trabalho, sem alterar confirmações, textos ou
  chamadas pela ponte IPC.
- Manteve os controles nativos e o foco já usados pelos diálogos; a marcação de trabalho ganhou
  apenas a superfície de formulário compartilhada.

## Arquivos modificados

- `admin/src/renderer/index.css` — primitivas de superfície, mapa, editor, registros e adaptação
  para largura estreita.
- `admin/src/renderer/screens/SetupScreen.tsx` — cartão de configuração na superfície compartilhada.
- `admin/src/renderer/screens/HomeScreen.tsx` — cabeçalho e painel do workbench de mapa.
- `admin/src/renderer/screens/TerritoryEditorScreen.tsx` — painel e mapa de desenho sem alterar fluxo.
- `admin/src/renderer/screens/BlockEditorScreen.tsx` — painel e mapa de desenho sem alterar fluxo.
- `admin/src/renderer/screens/TerritorySettingsScreen.tsx` — cartões de resumo/quadras e zona destrutiva.
- `admin/src/renderer/screens/BlockHistorySheet.tsx` — cabeçalho e linhas de registros.
- `admin/src/renderer/screens/BlockWorkPanel.tsx` — cartão, registros e ação secundária.
- `admin/src/renderer/screens/MarkWorkedForm.tsx` — superfície do formulário embutido.
- `admin/src/renderer/components/Dialog.tsx` — formatação compatível com o lint.

## Decisões técnicas

O desenho não foi convertido em painel de consulta: o mapa continua recebendo a altura disponível e
a lista lateral mantém a própria rolagem. As alterações estruturais foram limitadas a elementos
semânticos (`aside` e `section`) e classes de apresentação, para preservar comportamento e testes.

## Como validar

1. Abra Mapa e confirme que lista lateral e mapa não criam rolagens concorrentes.
2. Abra os editores em janela larga e estreita; o painel deve permanecer legível antes do mapa.
3. Em Configurações, expanda uma quadra e confirme que a exclusão continua exibindo sua confirmação.
4. Use teclado para abrir e fechar os diálogos de histórico e ações de quadra.

## Resultado da validação

- `npm test -- --run` para Setup, Mapa, editores, configurações, histórico e painéis: **180 testes passaram**.
- `npm run typecheck`: **passou**.
- `npm run lint`: continua bloqueado por `react-hooks/set-state-in-effect` em
  `admin/src/renderer/screens/HistoryScreen.tsx`, alteração pertencente à Task 12 em andamento;
  a formatação do `Dialog` não deixou warnings próprios.
- `git diff --check`: **passou**.
