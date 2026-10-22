# Implementação 0252: Correções da auditoria visual no admin desktop (spec 0018, Task 04)

Os IDs abaixo seguem a ordem das tabelas da seção "3. admin/" de `.centaur/specs/0018/audit.md`
(o audit não numera os achados): `G` = Global, `M` = App/Home (Mapa), `T` = Territórios e
TerritoryDetailDialog, `C` = Campanhas, `P` = Publicadores, Histórico, Configurações, Setup e
outras. `Hn` são as mudanças de hábito da seção 4, aplicadas só as aprovadas pelo usuário.

## O que foi feito

1. **Diálogos grandes (T1, C1).** `CampaignEditorDialog` e a prévia de importação S-13-T passaram a
   ter cabeçalho com "Fechar", corpo rolável (`.dialog-body`, padding de 24) e rodapé fixo com as
   ações. Em janela de 1024×560 o "Criar campanha" e o "Cancelar" ficam visíveis (rodapé em
   y=470–539). A importação ganhou largura própria (720px) e altura pelo conteúdo. O editor diz por
   que o salvar está desabilitado ("Dê um nome e escolha ao menos um território"), e o rótulo
   "Escolher pela" virou "Visualização".
2. **Contraste e tokens (G1–G5, G9, G13, G14).**
   - `.cell-sub`, `.cell-muted`, `.block-status-forced` e `.empty-state` saíram de
     `--text-tertiary`, que agora só colore ícones.
   - Novos tokens em `:root`: `--intent-success-text`, `--intent-warning-text`,
     `--intent-danger-text`, `--intent-info-*`, `--neutral-surface` e `--border-control`. Inputs e
     busca usam `--border-control` (3:1).
   - Hex soltos de alertas, notas, avisos de sucesso e erros de diálogo viraram tokens (os dois
     verdes do mesmo aviso agora são um só).
   - `.sidebar-product` foi para 11px.
3. **Uma cor por situação (G4).** "Em andamento" é âmbar (`status-working`) em Territórios,
   detalhe do território, Histórico completo, Publicadores e Campanhas. "Livre" e "Devolvido" são
   neutros. O selo próprio de Publicadores (`assignment-status`) foi removido em favor do
   `status-badge`, que também não encolhe mais (`flex: none; nowrap`).
4. **Sem gradiente e sem sombra em repouso (G8, G15, G16).**
   - Os dois gradientes (setup e cabeçalho do painel de Publicadores) saíram.
   - As sombras de botão primário, cards de KPI, sidebar, logo, card de setup, `.screen-card`,
     workbench do mapa, mapa do editor e linha do território no hover também saíram.
   - Ficaram só as sombras de diálogo, menu e painel de detalhe.
   - O véu duplo do modal da quadra (sombra de 9999px sobre o backdrop) foi removido.
   - Item ativo da sidebar: pílula neutra, texto 600, sem a barra azul.
5. **Cabeçalhos e tipografia (G9, G12, P4).**
   - Cabeçalhos de tabela (`DataTable`, histórico de Publicadores), rótulos de KPI e do resumo do
     território estão em sentence case 13/600, sem faixa e com borda inferior mais forte.
   - Saíram as eyebrows de Histórico, Configurações, histórico da quadra, editores, painel de
     Publicadores, detalhe de Campanhas e diálogo do território. Fica só a da sidebar.
   - O h1 de tela tem 20px. Configurações e histórico da quadra passaram de h2 para h1.
6. **Números e datas (G10, G11).**
   - `DataTable` aceita `numeric`: a coluna fica à direita, com algarismos tabulares. Usado em
     Quadras (Territórios), Retirada e Devolução (Histórico) e nos períodos de Campanhas.
   - `renderer/formatDate.ts` substitui seis cópias de `toLocaleDateString()` e fixa `pt-BR`.
7. **Padrão de consulta (M2, M3, T4, T6, C2, C3, C5, P1, P2, P3).**
   - Novo `ErrorNotice`, um erro com "Tentar novamente", em Demarcações, Territórios (erro de
     recarga), detalhe do território e Publicadores.
   - Demarcações mantém a lista na tela durante a atualização e anuncia o carregamento
     (`role="status"`).
   - Publicadores usa o `SearchField` com "Limpar busca", e o "sem resultado" ganhou "Limpar
     busca". O mesmo vale para Campanhas.
   - Escape fecha o painel de histórico de Publicadores e o detalhe de Campanhas. O detalhe de
     Campanhas ganhou um botão "Fechar detalhe" e devolve o foco à linha.
   - Campanhas sem seleção mostra "Escolha uma campanha na lista" com o próximo passo. O nome da
     campanha quebra linha em vez de ser cortado.
   - A lista de Publicadores fica numa largura de leitura (44rem).
   - Na lista de Demarcações, o dirigente e o último trabalho ficam cada um numa linha própria. A
     data não é mais cortada e não há texto colado na borda.
   - O vazio de Demarcações e o de Publicadores dizem a próxima ação.
8. **Acessibilidade (M5, T5, P5, G19).**
   - O modal da quadra usa o "Fechar" do `Dialog` no lugar do "×" manual.
   - Os menus "⋮" têm `aria-haspopup="menu"`.
   - As abas do detalhe do território seguem o padrão ARIA: setas, Home/End, tabindex rotativo e
     `aria-controls` só na aba visível.
   - SetupScreen tem `h1.sr-only`, e os erros de campo estão ligados por `aria-describedby`.
   - "Código copiado" é anunciado por `aria-live`.
   - O Leaflet e os rótulos dos dois mapas usam a fonte do app.
   - A etiqueta de território do `AssignmentsMap` saiu do estilo inline com hex e passou a usar
     classes ("Sem dirigente" agora em `--text-secondary`).
9. **Mudanças de hábito aprovadas pelo usuário** ("Títulos e nomes", "Menos ruído", "Diálogos
   próprios"):
   - **H7 + H19:** a seção da sidebar "Mapa" virou **"Demarcações"**, e o h1 da tela é
     "Demarcações", com o subtítulo "N territórios no mapa da congregação". Ver Desvios.
   - **H9:** selos curtos em Publicadores ("Ativo", "Código válido", "Sem código válido",
     "Desativado"). A frase longa fica no `title` do selo e no painel de detalhe.
   - **H10:** a paginação do Histórico completo virou "Anterior" e "Próxima".
   - **H18:** o atalho "Quadras" virou "Adicionar quadra".
   - **H21:** saiu a faixa de KPIs de Territórios. A contagem foi para o resumo ("10 de 12
     territórios designados · 2 livres").
   - **H23:**
     - "Cadastrar" virou "Cadastrar publicador".
     - "Designar…" e "Designar" (no território) viraram "Designar publicador…" e "Designar
       publicador".
     - "Remover" virou "Apagar" nos registros de trabalho.
     - "Recente" virou "Em dia".
   - **H24:** todo `window.confirm` virou `useConfirm()` (`components/ConfirmDialog.tsx`), com o
     mesmo texto, a pergunta como título, "Cancelar" com o foco e o botão nomeando a consequência.
     Os destrutivos usam o estilo de perigo. Isso cobre:
     - sair da congregação;
     - apagar território (Demarcações e Configurações) e apagar quadra;
     - designar com troca de dirigente, concluir e apagar registro do território;
     - apagar publicador;
     - apagar registro do Histórico completo;
     - designar, concluir, alterar e apagar campanha.
   - **Não aplicados (não aprovados):** H8 (os botões Atualizar ficaram como estavam), H20
     ("Exportar S-13-T" continua primário) e H22 (as primárias de Campanhas ficaram).

## Pendentes

- **G7:** espaçamentos fora da escala (10/14/20/22/36px) não foram normalizados.
- **G17:** classes duplicadas, regras mortas, `top: 66px` e primário por `:last-child` continuam.
- **G18:** `DataTable` ainda é parada de Tab sem overflow e usa `aria-selected` em `tr`.
- **T7, C6:** tabelas feitas à mão no detalhe do território e em Campanhas não migraram para
  `DataTable`. `.dot-*` ainda repete os hex de `blockColor.ts`.
- **T6:** o erro do diálogo de edição de designação continua sem `aria-describedby`.
- **Territórios no modo Mapa:** sem resultado, a tela ainda volta para a tabela.
- **Vocabulário:**
  - "designados" ainda aparece no resumo de Territórios.
  - "—" no lugar de "Em andamento" na coluna Devolução: mantido de propósito, porque a coluna
    Situação já diz "Em andamento".
  - O cabeçalho "Ações" do Histórico continua visível.
- **P baixa:** "Apagar tudo" do editor sem estilo de perigo; erros dos editores sem `role="alert"`
  ligado ao campo; "Designado a" em Configurações.
- **M7:** o boot do app ainda é um `<p>` sem shell.
- **Publicadores sem seleção:** sobra espaço à direita (o inspector acusa `hero-void` de 29%). Um
  detalhe vazio como o de Campanhas resolveria, mas mudaria o layout da tela.

## Tokens alterados em `admin/src/renderer/index.css`

- `--text-secondary`: `#5f7088` → **`#5a6b83`**. Fica em 5,43:1 no branco e 4,79:1 na seleção; o
  valor antigo dava 4,45:1 sobre `primary-soft`. O `DESIGN.md` ainda registra `#5F7088`.
- `--radius-sm`: `6px` → **`4px`**, alinhado ao `rounded.sm` do `DESIGN.md`. Os literais 6/8/4px
  de raio passaram aos tokens.
- Novos tokens: `--intent-success-text #1f7642`, `--intent-warning-text #955b0e`,
  `--intent-danger-text #b91c1c`, `--intent-info-surface #eaf1ff`, `--intent-info-border #a9c4ef`,
  `--intent-info-text #123f80`, `--neutral-surface #eef2f6` e `--border-control #8696ab`.

## Medidas do inspector

`inspect.mjs --app` com `window.api` falso, os mesmos dados de exemplo, em 1440/768/390. As capturas
ficam no scratchpad da sessão (`inspect/` antes e `after/` depois), fora do repositório.

| Tela | Antes | Depois |
|---|---|---|
| Demarcações (Mapa) | FAIL button-fx; FAIL edge-text (3 textos a 6–8px da borda); WARN font-count 3; WARN tiny-text 59%; WARN colour-sprawl | WARN colour-sprawl (cores de domínio das quadras, não mudam) |
| Territórios | FAIL button-fx; WARN contrast 3,5:1 ("há 286 dias"); WARN numeric-align 12/12 à esquerda | WARN blank-gap (só na captura de página inteira) |
| Campanhas | FAIL button-fx; WARN contrast 3,5:1; WARN hero-void 61%; WARN blank-gap | WARN hero-void 56% e blank-gap (com 1 campanha de exemplo; o detalhe vazio agora orienta); FAIL blank-gap na largura de 390 |
| Publicadores | FAIL button-fx; WARN hero-void 36% | WARN hero-void 29%; FAIL blank-gap na largura de 390 |
| Histórico completo | FAIL button-fx | nenhum achado |

Os FAIL de blank-gap aparecem só na captura de 390px de largura, que não é um alvo do Electron.
`lint.mjs --app` em `admin/src/renderer` foi de **2 FAIL / 52 WARN** para **0 FAIL / 30 WARN**.

Conferido no navegador em 1024×560:
- o editor de campanha rola o corpo e mantém o rodapé à vista;
- Escape fecha o editor;
- "Apagar" de um publicador abre o diálogo do app com o foco em "Cancelar" e o botão "Apagar
  publicador" em estilo de perigo.

## Arquivos afetados

- Novos:
  - `admin/src/renderer/components/ConfirmDialog.tsx`
  - `admin/src/renderer/components/ConfirmDialog.testing.ts` (auxiliar de teste)
  - `admin/src/renderer/components/ErrorNotice.tsx`
  - `admin/src/renderer/formatDate.ts`
- Estilos: `admin/src/renderer/index.css` e `admin/src/renderer/components/query-controls.css`.
- Componentes e mapas: `admin/src/renderer/components/DataTable.tsx`,
  `admin/src/renderer/map/AssignmentsMap.tsx` e `admin/src/renderer/map/TerritoryMap.tsx`.
- Telas em `admin/src/renderer/`:
  - `App.tsx`
  - em `screens/`: `HomeScreen.tsx`, `DesignationsScreen.tsx`, `TerritoryDetailDialog.tsx`,
    `TerritoryBlocksTab.tsx`, `CampaignsScreen.tsx`, `CampaignEditorDialog.tsx`,
    `PublishersScreen.tsx`, `HistoryScreen.tsx`, `TerritorySettingsScreen.tsx`,
    `BlockHistorySheet.tsx`, `BlockWorkPanel.tsx`, `SetupScreen.tsx`, `TerritoryEditorScreen.tsx`
    e `BlockEditorScreen.tsx`.
- Testes atualizados (sem teste novo):
  - `App.test.tsx`
  - em `screens/`: `HomeScreen.test.tsx`, `DesignationsScreen.test.tsx`,
    `CampaignsScreen.test.tsx`, `PublishersScreen.test.tsx`, `HistoryScreen.test.tsx`,
    `TerritorySettingsScreen.test.tsx`, `BlockHistorySheet.test.tsx` e `BlockWorkPanel.test.tsx`.
  - As confirmações agora são respondidas pelo diálogo do app (`answerConfirm`), não por um
    `window.confirm` simulado.

## Desvios

- **H7 + H19:** o pedido era "h1 do Mapa vira Mapa" e também renomear a seção da sidebar. Com a
  seção renomeada para "Demarcações", um h1 "Mapa" deixaria a tela com um nome diferente do item
  ativo. O h1 ficou "Demarcações", que mantém a intenção do H7 (a tela se nomeia e não repete a
  congregação). Se preferir outro nome, basta trocar as duas strings em `App.tsx` e
  `HomeScreen.tsx`.
- **H10:** o pedido citava Publicadores, mas a paginação "Página anterior/Próxima página" está no
  Histórico completo. Publicadores usa "Carregar mais". Apliquei onde a paginação existe.
- O `index.css` foi passado pelo Prettier, que também reformatou trechos que já estavam fora do
  padrão antes.

## Verificação

Em `admin/`:
- `npm run typecheck`: ok.
- `npm test`: 32 arquivos, 608 testes passando.
- `npm run lint`: ok.
- `npm run build`: ok.

Na primeira execução de base, antes das mudanças, houve uma falha intermitente que passou ao
repetir.
