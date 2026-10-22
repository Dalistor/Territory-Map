# Implementação 0251: Correções da auditoria visual no app admin Android (spec 0018, Task 03)

## O que foi feito
1. **Componente `Button` comum** (`components/Button.tsx`): variantes primário, secundário, perigo e
   discreto; altura mínima 48 dp (`touchTarget.default`); desabilitado visível (`disabledSurface`/
   `disabledText`); `accessibilityState` com `disabled` e `busy`; rótulo de ocupado sem mudar o tamanho.
   Substitui "Recarregar", "← Voltar", editar/apagar da designação, apagar registro de trabalho,
   "Tentar novamente", os botões dos modais e as ações da linha de território.
2. **Contraste e tokens** (`theme.ts`): valores alinhados ao `DESIGN.md` (cores, "Contrast rules" e
   "Mobile (Android)" da Task 02): `primary #155FC0`, `textPrimary #10233F`, `textSecondary #5F7088`,
   `border #DCE4ED`, `borderStrong #B8C6D6`, `canvas/surfaceSubtle #F8FAFC`; novos `dangerText`,
   `borderInput`, `textPlaceholder`, `scrim`, `mapOverlay`, `mapLabelInk`, superfícies e tintas de
   status (`success-ink`/`warning-ink`) e `touchTarget`. `textMuted` virou `text-tertiary` (#7B8AA0)
   e só aparece em não-texto (chevron, ponto de status). Sem sombra em repouso; sombra só em modal.
3. **Estados assíncronos**: Territórios só mostra carregamento na primeira carga; "Recarregar",
   designar e concluir mantêm lista, busca e seleção; erro de carga e erro de ação separados, a lista
   nunca some por erro, a recarga que falha oferece "Tentar novamente"; "Concluir" ocupado só na linha
   tocada. Cartão S-13 com "Tentar novamente" no erro de carga; modal de edição com `ScrollView`
   interno e ações fixas no rodapé (Salvar sempre alcançável). Histórico da quadra com "Tentar
   novamente"; "Apagando…" só no registro tocado. Paginação do histórico do publicador mantém a página
   esmaecida. Histórico completo não consulta com "De" posterior a "Até" e explica a correção.
   `QueryState` ganhou `onClear` ("Limpar busca"/"Limpar filtros"), modo `compact` (sem resultado
   sobre o mapa) e papel `alert` no erro; o botão fica fora do grupo acessível (alcançável no TalkBack).
4. **Mudanças de hábito aprovadas pelo usuário** (H11–H17, relayed pelo coordenador): tocar território
   no mapa abre as Quadras; "Quadras" da linha abre o detalhe pelo stack na aba Quadras
   (`initialSegment` na rota `TerritoryDetail`); voltar do aparelho no detalhe da quadra volta às
   quadras; "Marcar como concluído" dentro do card do dirigente atual, como secundário; "Apagar" na
   ponta oposta de "Editar"; seletor de publicador com o selecionado + até 8 nomes e "Mostrar todos
   (N)", busca com "Limpar", `radiogroup` e `checked`; vocabulário "Dirigente atual", "Retirada",
   "Devolução", "Último trabalho", "Em andamento/Concluída/Não designada", "Designar publicador",
   "Entrar".
5. Demais médios/baixos: cabeçalho claro (`surface`, título 18/700, borda, barra de status escura);
   "Sair" com 44 dp; ícone da tab oculto do leitor de tela; segmento sem "Selecionado" duplicado;
   legenda e atribuição do mapa em 11 sobre `mapOverlay` com borda; número da quadra vencida com tinta
   escura (5,11:1) sem mudar a cor de domínio; rótulo "Quadra N, status"; pílulas de situação pelos
   tokens (em andamento = warning, disponível = neutra, campanha = primary-soft); emoji removidos;
   nome do território flexível com fonte grande; rótulo da linha "Abrir território X, dirigente Y,
   situação Z"; títulos repetidos removidos dentro do detalhe e do painel da quadra; amostra de cor
   do status na lista de quadras e no painel; rótulos completos (quadra, histórico); "1 publicador";
   margens laterais de 16 em Publicadores e Campanhas; territórios da campanha em lista plana;
   "Devolvida" único; títulos 20/700; input do Setup com fundo branco e `borderInput`.

## Achados (audit.md, seção 2 — IDs atribuídos aqui por tabela e linha)
Prefixos: `A` App/TabIcon, `Q` QueryControls/UpdateModal, `M` mapa, `D` DesignationsScreen,
`S` AssignmentPanel, `B` PublisherPicker/BlockWorkSection/BlockPanel/BlocksScreen/TerritoryDetail,
`P` Publishers/PublisherHistory/History/Campanhas/Setup.

- **Resolvidos:** A1, A2, A3; Q1, Q2, Q3, Q4, Q5, Q6; M1, M2, M3, M4, M5, M6; D1, D2, D3, D4, D5,
  D6, D7, D8 (H11), D9 (H12), D10, D11, D12; S1, S2, S3, S4, S5 (H16), S6 (H13), S7, S8, S9;
  B1, B2, B3, B4 (H15), B5, B6, B7 (H16), B8 (H17), B9 (exceto Retirada no resumo do detalhe);
  P1, P2, P3, P4, P5, P6, P7, P8, P9, P10 (exceto `RefreshControl`).
- **Aplicadas da lista de hábito:** H11, H12, H13, H14, H15, H16, H17.
- **Pendentes:**
  - A4 — atualizar o UX-CONTRACT para quatro tabs (arquivo fora da posse desta task).
  - B9 (parte) — "Retirada" no resumo do detalhe do território: o `Territory` do app não traz
    `assignedSince`; exige mudança em `data/` e no contrato. O cartão S-13 logo abaixo já mostra a data.
  - P10 (parte) — `RefreshControl` (puxar para atualizar) nas consultas: capacidade nova de gesto,
    deixada para depois.

## Arquivos Afetados
- `admin-app/src/presentation/theme.ts`
- `admin-app/src/presentation/App.tsx`, `App.test.tsx`
- `admin-app/src/presentation/components/Button.tsx` (novo), `index.ts`, `QueryControls.tsx`,
  `QueryControls.test.tsx`, `TabIcon.tsx`, `UpdateModal.tsx`
- `admin-app/src/presentation/map/AssignmentsMapView.tsx`, `MapStatusLegend.tsx`
- `admin-app/src/presentation/screens/`: `DesignationsScreen.tsx`, `AssignmentPanel.tsx`,
  `BlockWorkSection.tsx`, `BlockPanel.tsx`, `BlocksScreen.tsx`, `TerritoryDetailScreen.tsx`,
  `PublisherPicker.tsx`, `PublishersScreen.tsx`, `PublisherHistoryScreen.tsx`, `HistoryScreen.tsx`,
  `CampaignsScreen.tsx`, `CampaignDetailScreen.tsx`, `SetupScreen.tsx` e os testes de
  Designations, AssignmentPanel, BlockPanel, BlocksScreen, TerritoryDetail, Campaigns, Publishers,
  PublisherHistory e Setup.

## Testes
Testes atualizados onde rótulos e comportamento aprovados mudaram. Proteções ampliadas em casos
existentes, só para falhas vitais: recarga e escrita recusada não apagam a lista (Designations);
erro de carga do cartão S-13 com "Tentar novamente" (AssignmentPanel); um caso novo para H17
(voltar do aparelho fecha a quadra antes de sair do território) e `initialSegment`.

## Verificação
- `npm test` em `admin-app/`: 23 suítes, 342 testes passando.
- `npm run lint`: sem erros nem avisos. `npm run typecheck`: limpo.
- `lint.mjs --app` (design-taste-frontend) em `src/presentation`: antes 5 FAIL (emoji) + 1 WARN de
  cor; depois 0 FAIL e 2 WARN (`padStart` de datas, legítimo).
- Sem captura em emulador: falta JDK 17 nesta máquina (AGENTS.md). Nenhum Gradle executado.
- O aviso `act(...)` no console de `PublishersScreen.test.tsx` vem do ambiente de teste e não falha
  a suíte; a lógica de carga daquela tela não mudou.
