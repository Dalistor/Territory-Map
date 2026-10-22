# Implementação 0250: App do publicador na linguagem de DESIGN.md (spec 0018, Task 02)

## O que foi feito
Aplicados os achados da seção 1 (`app/`) de `.centaur/specs/0018/audit.md`, em ordem de efeito, e as
mudanças de hábito aprovadas pelo usuário (H2, H3, H4, H5, H6). O app continua abrindo no Início
(H1 não aprovado) e a marcação continua exigindo a confirmação do servidor.

1. **Tokens.** `app/src/presentation/theme.ts` passou à versão mobile do `DESIGN.md`, mantendo os
   nomes das chaves: paleta do DESIGN.md, `surfaceSubtle #F8FAFC`, `textPlaceholder`, `borderInput`,
   `focus`, `scrim`, `mapOverlay`, `mapLabelInk`, `success/warning` ink; `textMuted` removido; raios
   8/12/pill + `sheet`; escala `fontSize`; `touchTarget` (44/48); sombras só `sm`/`md` (elevation 2/6).
   Botões, cards, chips e a barra de filtros ficaram planos; a sombra ficou só no card sobre o mapa,
   nos modais e nas sobreposições do mapa. Cabeçalho claro (`surface`, título 18/700, borda inferior).
2. **Estados.** Início: carregando por seção (linhas cinza na altura real, sem vazio falso), erro
   dentro da seção com "Tentar novamente" (`components/SectionState.tsx`), puxar para atualizar e
   recarga ao voltar do mapa (`subscribeToReturn`, ligado a blur/focus em `App.tsx`). Mapa: indicador
   "Carregando territórios…", faixa de sucesso "Quadra N marcada como trabalhada" (some em 4 s,
   live region) e faixa de erro em `danger` com "Tentar novamente" (recarrega o mapa ou reabre a
   confirmação) e "Fechar".
3. **Mapa legível.** Legenda fixa (Nunca trabalhada / Vencida / Em dia) sempre que há quadras; tinta do
   número por categoria (`mapLabelInk` sobre o laranja, branco no vermelho e no verde), fonte 12;
   rótulo acessível "Quadra N, <status>"; rótulos e atribuição em 11 sobre `mapOverlay`. As cores de
   domínio (`CATEGORY_COLOR`, `blockColor.ts`) não mudaram.
4. **Status forçado.** Nova função pura `domain/blockStatusLabel.ts` (mesmos rótulos do admin-app),
   com teste; os dois modais da quadra mostram o status por extenso, com "(forçado)", além da data.
5. **Toque, emoji, rótulos.** Chips, "Ver todos", "Cancelar", "Ver no mapa", "Tentar novamente",
   "Limpar" e "Ver mais" com 44 dp ou mais; chips como `radio` num `radiogroup` "Filtro do mapa";
   emoji removidos (✓, 📍, ⚠️, 🔍, ✕ → "Limpar"); rótulos sem caixa alta; datas por `formatDate`/
   `formatTime` (dd/mm/aaaa, HH:MM).
6. **Ativação.** Sem card; logo 96; rótulo 14/600; `maxLength 8`, `autoFocus`, `returnKeyType="go"`
   enviando pelo teclado; erro com `accessibilityRole="alert"`; borda do campo em `borderInput`.
7. **Mudanças de hábito aprovadas.** H2 (Designados a você no topo da Visão geral), H6 (saudação e
   faixa de números saem; contexto "nome · congregação, cidade" e contagens no subtítulo de cada
   seção, com "N quadras · X vencidas" pela mesma regra de cor do mapa), H3 (aba "Início"; seções
   "Designados a você", "Trabalhados por você", "Histórico"; o título do cabeçalho "Meus territórios"
   foi mantido), H4 ("Marcar como trabalhada") e H5 ("Ativar acesso").
8. **Lint.** Os dois `no-explicit-any` pré-existentes corrigidos (`data/update-client.ts`,
   `domain/appUpdate.ts`, com o tipo do payload).
9. **DESIGN.md.** Tokens faltantes da seção 5 do audit, versão mobile e regras de contraste.

## Achados do audit (seção 1)
IDs atribuídos aqui por ordem de linha em cada tabela do audit.

| ID | Achado | Situação |
|---|---|---|
| T1 | Paleta divergente | resolvido |
| T2 | `textSecondary` sobre `surfaceSubtle` 4,34 | resolvido (4,83) |
| T3 | `textMuted` no placeholder | resolvido (`textPlaceholder`) |
| T4 | `danger` sobre `dangerSurface` 4,41 | resolvido (4,63) |
| T5 | Raios 16/24 | resolvido |
| T6 | Sombra em repouso | resolvido |
| T7 | Cabeçalho azul | resolvido |
| T8 | Emoji como interface | resolvido |
| T9 | `toLocaleDateString` sem locale | resolvido |
| AC1 | Card na ativação | resolvido |
| AC2 | Rótulo em caixa alta | resolvido |
| AC3 | `maxLength`/`autoFocus`/envio pelo teclado | resolvido |
| AC4 | "Confirmar" → "Ativar acesso" (H5) | resolvido, aprovado |
| AC5 | Erro sem live region | resolvido |
| D1 | Sem carregamento (vazio falso) | resolvido |
| D2 | Erro sem "Tentar novamente" (inclusive Campanhas) | resolvido |
| D3 | "Ver no mapa" ~34 dp | resolvido (44) |
| D4 | "Ver no mapa" sem rótulo acessível | resolvido |
| D5 | Saudação + KPIs (H6) | resolvido, aprovado |
| D6 | Designados depois de Trabalhados (H2) | resolvido, aprovado |
| D7 | Vocabulário/caixa (H3) | resolvido, aprovado (título do cabeçalho mantido) |
| D8 | Dados velhos ao voltar do mapa | resolvido |
| D9 | Selo de data e "✓ Feito" | resolvido |
| D10 | Histórico sem limite | resolvido (20 + "Ver mais") |
| D11 | Espaçamentos fora da escala | resolvido |
| D12 | `tablist` sem rótulo | resolvido |
| M1 | Mapa sem legenda | resolvido |
| M2 | Número branco sobre o laranja 3,08 | resolvido (5,11) |
| M3 | Chips ~35 dp | resolvido |
| M4 | "Ver todos" ~34 dp | resolvido |
| M5 | "Cancelar" ~40 dp | resolvido |
| M6 | "Confirmar" → "Marcar como trabalhada" (H4) | resolvido, aprovado |
| M7 | Sem confirmação de sucesso | resolvido |
| M8 | Faixa âmbar única, sem retry nem fechar | resolvido |
| M9 | Sem carregamento no mapa | resolvido |
| M10 | Status ignora `statusOverride` | resolvido, com teste |
| M11 | Rótulos em caixa alta | resolvido |
| M12 | Hex soltos e fonte 10 | resolvido; `OTHER_TERRITORY_COLOR` (traço do contorno, não texto) ficou local |
| M13 | Sombra na barra de filtros | resolvido |
| M14 | Chip com `role=button` | resolvido (`radio`/`radiogroup`) |
| M15 | Limpar busca ~27 dp e "✕" | resolvido ("Limpar", `hitSlop` 10) |
| M16 | "Fechar" primário no modal de leitura | resolvido (secundário) |

**Fora:** H1 (abrir direto no mapa) — não aprovado pelo usuário; a tela inicial continua o Início.

## Para os admins acompanharem (DESIGN.md)
Nenhum valor existente do DESIGN.md mudou. Registrados como correção: `text-tertiary #7B8AA0` só
para não-texto (o admin desktop ainda o usa em `.cell-sub`, `.cell-muted`, `.block-status-forced`);
`success`/`warning` como texto sobre as próprias superfícies não fecham AA → `success-ink`/
`warning-ink`; `text-secondary` não fecha AA sobre `primary-soft`; `rounded.sm` é 4 (o desktop usa 6).

## Arquivos Afetados
- `DESIGN.md`
- `app/src/presentation/theme.ts`, `App.tsx`, `App.test.tsx`
- `app/src/presentation/components/PrimaryButton.tsx`, `UpdateModal.tsx`, `SectionState.tsx` (novo)
- `app/src/presentation/screens/ActivationScreen.tsx`, `DashboardScreen.tsx`, `MapScreen.tsx` e os três testes
- `app/src/presentation/map/TerritoryMapView.tsx`
- `app/src/domain/blockStatusLabel.ts` (novo) e teste, `lastWorked.ts` (`formatTime`), `index.ts`, `appUpdate.ts`
- `app/src/data/update-client.ts`

## Verificação
- `npm test` em `app/`: 16 suítes, 148 testes passando (eram 146; +2 de `blockStatusLabel`, e a
  confirmação de sucesso entrou no teste de marcação que já existia).
- `npx tsc --noEmit`: sem erros. `npm run lint`: sem erros nem avisos.
- Testes atualizados só onde a UI mudou: "Confirmar" → "Ativar acesso"/"Marcar como trabalhada",
  data por `formatDate`, saudação → linha de contexto e contagens, "Meus Territórios" → "Início".
- Não verificado: captura em emulador (sem JDK 17 nesta máquina); a legenda e a tinta do número
  ficam no componente nativo do MapLibre, sem teste automatizado (risco assumido do AGENTS.md).
