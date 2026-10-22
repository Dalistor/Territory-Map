# Auditoria visual — spec 0018, Task 01

**Data:** 2026-10-22 · **Modo:** revisão (design-taste-frontend, caminho *review*: registrar o antes, criticar, listar achados, três mudanças por cliente). Nenhum código foi alterado.

## Como foi feito

- **app/** e **admin-app/** (React Native): auditados pelo código (estilos, hierarquia, estados, alvos de toque calculados por padding + altura de linha, contraste calculado a partir dos hex). Sem emulador (falta JDK 17).
- **admin/** (Electron): o renderer subiu num Vite temporário fora do repositório, com um `window.api` falso e dados de exemplo (12 territórios, 7 publicadores, 1 campanha). `inspect.mjs --app` rodou em Mapa, Territórios, Campanhas, Publicadores e Histórico completo (1440 e 1024/768); capturas e `report.json` ficaram no scratchpad da sessão, não no repo.
- `lint.mjs --app` rodou nos três clientes. Resultado: app 8 FAIL (emoji), admin-app 5 FAIL (emoji) + 1 WARN de cor de framework (`#10b981`), admin 2 FAIL (gradiente em `index.css:687` e `:997`) + 52 WARN (15 eyebrows, 29 sombras).
- Leitura linha a linha do código: todas as telas, componentes e o CSS inteiro de `admin-app/` e `admin/`, verificando as linhas citadas.
- Contraste: fórmula WCAG 2.x. "AA" = 4,5:1 para texto normal, 3:1 para não-texto.

Severidade: **alta** = quebra AA, alvo de toque, estado falso ou contradiz o AGENTS/UX-CONTRACT; **média** = hierarquia, token ou estado incompleto; **baixa** = acabamento.

Restrições respeitadas: as cores de status de quadra (`blockColor.ts` e as cópias, `BLOCK_CATEGORY_COLOR`) não mudam; nenhuma proposta cria capacidade nova.

---

## 1. app/ — publicador (foco principal)

O tema (`app/src/presentation/theme.ts`) é anterior ao DESIGN.md. Ele usa a paleta Tailwind/Material: `primary #1565c0`, que no DESIGN.md é `#155FC0`; `textPrimary #0f172a`, que é `#10233F`; `textSecondary #64748b`, que é `#5F7088`; `border #e2e8f0`, que é `#DCE4ED`; `danger #dc2626`, que é `#C63D37`; `success #16a34a`, que é `#25834A`. Ele também traz raios de 16 e 24 que não existem no DESIGN.md. Hoje o app não abre no mapa: a primeira tela é o Dashboard (`App.tsx:332`).

### Tema e transversal

| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | tokens | `theme.ts:7-32` | Paleta divergente do DESIGN.md (valores acima) | Trocar pelos tokens do DESIGN.md com a versão mobile (ver "Tokens que faltam"). Manter os nomes das chaves para não mexer nas telas. |
| alta | contraste | `theme.ts:17` com `ActivationScreen.tsx:85` | `textSecondary #64748b` sobre `surfaceSubtle #f1f5f9` = 4,34:1. Aparece no placeholder da busca, nas abas inativas, nos selos e nos rótulos de estatística | `#5F7088` sobre `#F8FAFC` = 4,83:1. Usar `surfaceSubtle = #F8FAFC` (o mesmo do DESIGN.md). |
| alta | contraste | `theme.ts:18`, `ActivationScreen.tsx:85` | `textMuted #94a3b8` no placeholder `ABCDEFGH` = 2,34:1 | Placeholder em `textSecondary`. Remover `textMuted` como cor de texto. |
| alta | contraste | `theme.ts:20-21`, `ActivationScreen.tsx:175-185`, `DashboardScreen.tsx:432` | `danger #dc2626` sobre `#fef2f2` = 4,41:1 | `#C63D37` sobre `#FFF1F0` = 4,63:1 |
| média | tokens | `theme.ts:43-50` | `radius.lg 16` e `radius.xl 24` fogem de 8/12/pill | Controle 8, painel 12, pill. A folha de baixo pode usar 16 só no topo (token novo `sheet`). |
| média | tokens | `theme.ts:52-74`; `DashboardScreen.tsx:444,552,619`; `PrimaryButton.tsx:82` | Sombra em card em repouso, no botão primário e no chip ativo. O DESIGN.md quer as superfícies planas | Sombra só no que flutua: o card sobre o mapa, o modal e a barra de filtros sobre o mapa. Botões e cards ficam planos, com borda de 1 px. |
| média | tokens | `App.tsx:309-311` | Cabeçalho azul sólido (acento no chrome; regra das telas de app) | Cabeçalho `surface` com título em `textPrimary` 18/700 e borda inferior. A mudança é só visual. |
| média | acessibilidade | `DashboardScreen.tsx:392,399,406`; `MapScreen.tsx:240,519,538` | Emoji como interface (`✓`, `📍`, `⚠️`, `🔍`, `✕`). A cor e o tamanho variam por fabricante, e o leitor de tela lê "marca de seleção" | Ícones desenhados com `View`, como no `admin-app/.../TabIcon.tsx`, ou texto. O `✕` vira "Limpar". |
| baixa | conteúdo | `DashboardScreen.tsx:304,387,403` | `toLocaleDateString()` sem locale. Fora de pt-BR sai `10/22/2026` | `formatDate` de `domain/lastWorked` (dd/mm/aaaa) |

### ActivationScreen (`screens/ActivationScreen.tsx`)

| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| média | hierarquia | `:121-134` | Card com raio 24, `shadow.md` e logo de 140×160 numa tela que tem um campo só | Sem card: a logo em 96, o título 22/700, o campo e o botão direto no canvas, com margem de 24 |
| média | acessibilidade | `:150-157` | Rótulo em caixa alta com tracking | Sentence case, 14/600 |
| média | fluxo | `:79-91` | Sem `maxLength={8}`, sem `autoFocus`, e o "concluir" do teclado não envia | `maxLength 8`, `autoFocus`, `returnKeyType="go"`, `onSubmitEditing` quando o código estiver preenchido |
| baixa | conteúdo | `:95` | O botão diz "Confirmar" | "Ativar acesso" (ver Mudanças de hábito, item H5) |
| baixa | estado | `:92` | O erro só aparece como texto | `accessibilityLiveRegion="polite"` e `accessibilityRole="alert"` |

### DashboardScreen (`screens/DashboardScreen.tsx`)

A pergunta que a tela deveria responder é **"onde eu trabalho hoje?"**. Hoje a resposta, os territórios designados com as quadras vencidas, vem por último: depois de uma saudação, de uma faixa de números e de "Territórios trabalhados".

| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | estados | `:60-63, :294-296, :326-330` | Não há estado de carregamento. Antes da resposta, a tela afirma "Nenhuma quadra trabalhada ainda" e "Nenhum território designado", um vazio falso | Estado `loading` por seção, com linhas cinza na altura real e textos de cabeçalho visíveis. Os textos de vazio só aparecem depois da resposta. |
| alta | estados | `:28-29, :106-110` | O erro manda "abrir a tela de novo" e não oferece ação | Erro dentro da seção que falhou, com o botão "Tentar novamente" refazendo os `load*`. Mesmo tratamento para Campanhas (`:240-241`). |
| alta | acessibilidade | `:614-628` | O botão "Ver no mapa" tem cerca de 34 dp de altura (8+8 de padding e linha de 18) | `minHeight: 44`, `paddingHorizontal 16` |
| alta | acessibilidade | `:340-346` | "Ver no mapa" do território designado não tem `accessibilityLabel`: com vários, o leitor ouve rótulos iguais | `accessibilityLabel={\`Ver ${territory.name} no mapa\`}`, como já é na campanha (`:273`) |
| média | hierarquia | `:113-152` | "Olá, nome" com avatar e números em azul: o padrão de saudação com KPIs, proibido nas telas de app. "Designados" e "Trabalhados" não dizem a unidade, e "Visitas" aparece e some, deslocando o layout | Trocar o herói por uma linha de contexto (nome · congregação, 14 cinza). Os números viram o subtítulo de cada seção ("2 territórios", "9 quadras vencidas"). |
| média | hierarquia | `:175-180` | Na aba Visão geral, "Territórios trabalhados" vem antes de "Território(s) designado(s)" | Designados primeiro, cada linha com nome, "N quadras · X vencidas" (contagem por `blockColorCategory`, regra que já existe) e "Ver no mapa" (ver H2) |
| média | conteúdo | `:159, :324, :366`; `App.tsx:332` | Mistura de "Meus Territórios", "Território(s) designado(s)" e "Histórico de Trabalho" (Title Case). O título "Meus territórios" se repete na aba | Sentence case e plurais calculados: "Designados a você", "Trabalhados por você", "Histórico". Ver H3. |
| média | estados | `:70-102` | Os dados só carregam ao montar a tela. Depois de marcar no mapa e voltar, os números ficam velhos | `RefreshControl` (puxar para atualizar) e recarga no `focus` da navegação. É a mesma leitura de hoje. |
| média | tokens | `:601-608, :662-673` | O selo de data tem borda e o selo "✓ Feito" é verde em toda linha: cor de status como textura | Data em texto cinza à direita, alinhada à direita e com algarismos tabulares. Tirar o "Feito", porque toda linha do histórico é feita por definição. |
| média | fluxo | `:378-409` | O histórico cresce sem limite dentro do `ScrollView` | Mostrar as 20 mais recentes com "Ver mais", ou `FlatList` como rolagem única |
| baixa | tokens | `:513, :582, :604, :634` | Espaçamentos 3, 14, 4 e 12 fora de 4/8/16/24/32 | 4, 16, 4 e 16 |
| baixa | acessibilidade | `:157` | `tablist` sem `accessibilityLabel` | `accessibilityLabel="Seções do início"` |

### MapScreen e TerritoryMapView

| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | acessibilidade | `TerritoryMapView.tsx:68-76, 380-430` | O mapa não tem legenda: vermelho, laranja e verde são o único sinal de status. O DESIGN.md diz que nenhum estado depende só da cor | Legenda fixa (Nunca trabalhada / Vencida / Em dia), igual ao `MapStatusLegend` do admin-app, só com estilo. As cores não mudam. |
| alta | contraste | `TerritoryMapView.tsx:520` | Número branco de 11 px sobre a quadra vencida `#ef6c00` = 3,08:1 | A cor de fundo é de domínio e fica. Muda a tinta do número: `#10233F` sobre `#ef6c00` dá 5,11:1, com o branco mantido no vermelho (5,62) e no verde (5,13). Fonte para 12. |
| alta | acessibilidade | `MapScreen.tsx:664-672` | Chips de filtro com cerca de 35 dp | `minHeight: 44`, `justifyContent: 'center'` |
| alta | acessibilidade | `MapScreen.tsx:747-754` | "Ver todos" no card flutuante com cerca de 34 dp | `minHeight: 44` |
| média | acessibilidade | `MapScreen.tsx:820-824` | "Cancelar" do modal de marcar com cerca de 40 dp | `minHeight: 44` |
| média | conteúdo | `MapScreen.tsx:354` | O botão de compromisso diz "Confirmar"; o UX-CONTRACT pede "Marcar como trabalhada" | Ver H4 |
| média | estados | `MapScreen.tsx:229-234` | Depois de marcar com sucesso, nada é dito: a quadra muda de cor e só | Faixa curta de sucesso ("Quadra 7 marcada como trabalhada"), que some em 4 s e usa `accessibilityLiveRegion` |
| média | estados | `MapScreen.tsx:238-243, 591-608` | A mesma faixa âmbar serve para erro de rede, de servidor e de permissão; não fecha e não tem "Tentar novamente" | Erro em `danger` com "Tentar novamente" (refaz `loadMap`, ou reabre a confirmação quando a marcação falhou) e um botão "Fechar" |
| média | estados | `MapScreen.tsx:114-133` | Não há carregamento: o mapa aparece parado no recorte padrão (Brasília) até chegar a lista | Indicador sobre o mapa enquanto `territories` está vazio e a requisição não respondeu |
| média | estados | `MapScreen.tsx:330-333, 372-375`; `domain/lastWorked.ts:44` | "Status recente" ignora o `statusOverride`: a quadra forçada aparece laranja e o texto diz "Última visita: hoje" | Rótulo por extenso igual ao `blockStatusLabel` do admin-app ("Vencida (forçado)"), como função pura em `domain/`, com teste |
| média | tokens | `MapScreen.tsx:801, 155`; `ActivationScreen.tsx:155` | Rótulos em caixa alta ("STATUS RECENTE:") | Sentence case 13/600 |
| média | tokens | `TerritoryMapView.tsx:493-530` | Hex soltos (`#1565c0`, `#37474f`, `#333333`) e fontes de 10 px (`territoryLabelMine`, atribuição) abaixo do piso de 11 | Usar tokens. Mínimo de 11 (a atribuição do OSM pode ficar em 11). |
| média | hierarquia | `MapScreen.tsx:609-618` | Barra de filtros com `shadow.md` e `elevation 8`; card inferior com `shadow.lg` | `shadow.md` só no card inferior; a barra de filtros fica plana com borda inferior |
| baixa | acessibilidade | `MapScreen.tsx:479-482` | Chip com `role="button"` e `selected` | `accessibilityRole="radio"` ou `tab`, dentro de um grupo com rótulo "Filtro do mapa" |
| baixa | acessibilidade | `MapScreen.tsx:531-539` | Limpar busca: cerca de 27 dp, mais `hitSlop` 8, dá cerca de 43 | `hitSlop` 10 e texto "Limpar" no lugar de `✕` |
| baixa | hierarquia | `MapScreen.tsx:382-391` | "Fechar" no modal só de leitura é primário sólido | Botão secundário (superfície com borda) |

### As três mudanças de maior efeito — app/

1. **Tema do DESIGN.md com tokens mobile** (paleta, raios 8/12/pill, sombras só no que flutua, cabeçalho claro). Isso resolve sozinho cinco das quebras de contraste AA e põe o app na mesma família dos admins.
2. **Estados honestos em Início e Mapa**: carregando sem vazio falso, erro na seção com "Tentar novamente", feedback de sucesso ao marcar e atualizar ao voltar do mapa.
3. **Mapa legível sem depender da cor e operável com o polegar**: legenda de status, número da quadra com contraste AA sobre o laranja, chips e botões de 44 dp, sem emoji.

---

## 2. admin-app/ — admin em campo

Passada completa pelo código. Os caminhos são relativos a `admin-app/src/presentation/`.

Contrastes medidos:

- `textMuted` sobre branco: 2,56:1.
- `textSecondary` sobre `surfaceSubtle`: 4,34:1; sobre `primaryLight`: 4,17:1.
- `danger` sobre `dangerSurface`: 4,41:1.
- `#78909c` sobre branco: 3,35:1.
- Bordas de input contra o fundo: de 1,13 a 1,48:1.

Substitutos verificados:

- `#5F7088`: 5,05:1 sobre branco e 4,61:1 sobre `surfaceSubtle`.
- `#b91c1c` sobre `dangerSurface`: 5,91:1.
- `#7b8ba1` como borda: 3,47:1.
- `#10233F` sobre o laranja `#ef6c00`: 5,11:1.

### App.tsx e TabIcon
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | alvo de toque | `App.tsx:609-612` | "Sair" no cabeçalho com cerca de 28 dp e sem `hitSlop` | `minHeight 44`, `minWidth 44`, `paddingHorizontal 16` |
| média | tokens | `App.tsx:409, 490` | Cabeçalho azul sólido (acento no chrome) | Cabeçalho `surface`, tinta `textPrimary`, borda inferior, `statusBarStyle 'dark'` |
| baixa | acessibilidade | `components/TabIcon.tsx:32-34` | O ícone é `accessible` dentro do botão da tab e o rótulo é lido duas vezes | `accessible={false}` |
| baixa | doc | `App.tsx:531` | A tab Campanhas existe, mas o UX-CONTRACT ainda fala em três tabs | Atualizar o contrato |

### components/QueryControls.tsx e UpdateModal.tsx
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | contraste | `QueryControls.tsx:279, 284, 44` | Detalhe da lista, texto da paginação e placeholder em `textMuted` (2,56:1) | `textSecondary` |
| média | hierarquia | `QueryControls.tsx:293` | "Tentar novamente" com fundo `danger` numa ação que não é destrutiva | Primário ou secundário |
| média | acessibilidade | `QueryControls.tsx:95-106` | O segmento anuncia "selecionado" três vezes e mostra o texto "Selecionado" em 11 dp | Só `accessibilityState`; seleção visual por `primaryLight` com borda |
| baixa | estados | `QueryControls.tsx:194` | O estado sem resultado não traz "Limpar busca/filtros" | Prop `onClear` |
| baixa | tokens | `QueryControls.tsx:276, 299, 278, 284, 300, 303` | Sombras em repouso; margens de 1, 2 e 3 | Sem sombra; `spacing.xs` |
| baixa | contraste/tokens/acessibilidade | `UpdateModal.tsx:180-185, 134, 125, 86-95, 67` | `changelogTitle` 4,34:1; raio 16; scrim solto; sem estado de ocupado; barra sem `progressbar` | `textPrimary`; `radius.md`; `colors.scrim`; `accessibilityState`/`accessibilityValue` |

### Mapa (AssignmentsMapView, MapStatusLegend)
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | tipografia | `MapStatusLegend.tsx:56`, `AssignmentsMapView.tsx:400` | Fonte de 10, abaixo do piso de 11 | 11 |
| alta | contraste | `AssignmentsMapView.tsx:390` | Número branco sobre a quadra vencida = 3,08:1 | Tinta por categoria: `#10233F` na vencida (5,11). O fundo de domínio não muda. |
| média | contraste | `AssignmentsMapView.tsx:379` | "Sem dirigente" em `#78909c` = 3,35:1 | `textSecondary` |
| média | acessibilidade | `AssignmentsMapView.tsx:349` | O rótulo "Quadra N" não traz o status, que só aparece pela cor | `` `Quadra ${n}, ${blockStatusLabel(...)}` `` |
| média | tokens | `AssignmentsMapView.tsx:370-400`, `MapStatusLegend.tsx:34-64` | Hex e rgba soltos; raios de 4, 5 e 6; espaços de 1, 2, 5, 6 e 10 | Tokens, `colors.mapOverlay`, `radius.sm` |
| baixa | ampliação de fonte | `AssignmentsMapView.tsx:385` | `height: 24` fixo corta o número com fonte grande | `minHeight: 24` |

### DesignationsScreen (aba Territórios)
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | alvo de toque | `:644-650` (usado em `:347`, `:583`) | `headerButton` com cerca de 31 dp ("Recarregar", "← Voltar") | `minHeight 44` |
| alta | estados | `:230-231, :369-375` | Recarregar, designar e concluir apagam busca e lista e mostram um spinner solto | `isLoading` só no primeiro carregamento; a recarga mantém a lista |
| alta | estados | `:376, :277, :332-337` | Qualquer erro, inclusive o de "Marcar como concluído", esconde a lista. O banner não tem "Tentar novamente" | Separar `actionError` de `loadError`; usar `QueryState error` com `onRetry` |
| média | tokens/semântica | `:714-741` | Hex de Tailwind soltos. "Em andamento" é verde aqui e âmbar no Histórico | Pílulas pelos tokens: em andamento = warning; disponível = neutra; em campanha = `primaryLight` |
| média | ícones | `:505, :511` | Emoji (🧱 🗓) | Remover ou usar um glifo em `View` |
| média | contraste | `:841-858` | Selos com 12 dp de `textSecondary` sobre `surfaceSubtle` (4,34:1) | Selo sem fundo, ou `#5F7088` |
| média | ampliação de fonte | `:444, :699-704` | O nome do território não tem `flex` e o selo sai da tela com fonte grande | `flex: 1`, `flexShrink: 1` |
| média | fluxo | `:397` | No mapa, tocar o território abre o detalhe em "Designações". O AGENTS.md (2026-08-26) diz que abre as quadras | `initialSegment: 'blocks'` (ver H11) |
| média | fluxo | `:524-529` | "Quadras" na linha abre um overlay com um segundo "← Voltar", e lá não dá para apagar registro. Pelo stack, o mesmo caminho abre o `BlockPanel`, que apaga | Navegar para `TerritoryDetail` na aba Quadras (ver H12) |
| média | estados | `:392-407` | Modo Mapa com busca sem resultado: o mapa fica vazio sem explicação | `QueryState no-results` compacto sobre o mapa |
| baixa | estados/tokens | `:410-421, :560, :690, :649, :711, :724, :752, :803, :768-774, :846-849` | Vazio em texto simples; sem resultado sem "Limpar"; `isWriting` global; sombra em repouso; espaços e raio fora da escala; estilos mortos | `QueryState`; `writingTerritoryId`; tokens |
| baixa | acessibilidade | `:433` | O rótulo "Ver designações de X" não corresponde ao destino | "Abrir território X, dirigente Y, situação Z" |

### AssignmentPanel (cartão S-13)
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | alvo de toque | `:748-781, :772` | "Editar" e "Apagar" com cerca de 32 dp e a 4 dp um do outro (apagar é irreversível) | `minHeight 44`, gap de 8, "Apagar" isolado (ver H14) |
| alta | alvo de toque | `:821-824, :641` | `reopenCheckbox` com cerca de 28 dp, desenhado com os glifos ☑/☐ | Linha de 44 dp com caixa desenhada em `View` |
| alta | estados | `:421-424` | O erro ao carregar o cartão não traz "Tentar novamente" | `QueryState error` com `onRetry` |
| alta | layout | `:557-673, :797` | Modal com `maxHeight 90%` e sem `ScrollView`: com o `PublisherPicker` completo, "Salvar" sai da tela | `ScrollView` interno e ações fixas no rodapé |
| média | vocabulário | `:427, :433, :466-469, :583, :607` | "Designação atual", "desde", "Data de início/conclusão" | "Dirigente atual", "Retirada", "Devolução" (ver H16) |
| média | hierarquia | `:523-550` | Dois primários sólidos iguais; "Marcar como concluído" fica longe da designação que encerra | Concluir vira secundário dentro do card atual (ver H13) |
| média | estado desabilitado | `:531` | "Designar" sem publicador escolhido parece ativo | `disabledSurface`/`disabledText` |
| média | contraste | `:740-759`; também `DesignationsScreen.tsx:663`, `SetupScreen.tsx:304` | `danger` sobre `dangerSurface` = 4,41:1 | Token `dangerText #b91c1c` (5,91) |
| baixa | tokens | `:690, :803, :795, :796, :788, :734, :754, :780` | Títulos de 18; raio 16; `elevation 5`; scrim solto; paddings de 6 e 12 | 20; `radius.md`; `shadows.md`; `colors.scrim`; `minHeight 48` |

### PublisherPicker, BlockWorkSection, BlockPanel, BlocksScreen, TerritoryDetailScreen
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | alvo de toque | `BlockWorkSection.tsx:400-412` | "Apagar" do registro de trabalho com cerca de 24 dp e texto 12 | `minHeight 44`, texto 14 |
| média | tokens | `PublisherPicker.tsx:63-85`; `BlockWorkSection.tsx:393-466` | Não usam o tema: hex e espaços soltos | `colors.*`, `spacing.*` |
| média | acessibilidade | `PublisherPicker.tsx:51-53` | Papel `radio` com `selected`, que o TalkBack não anuncia | `checked` e um contêiner `radiogroup` |
| média | hierarquia | `PublisherPicker.tsx:47-58` | Lista todos os publicadores e empurra "Marcar como trabalhada" e "Designar" várias telas para baixo | O selecionado e até 8 resultados, com "Mostrar todos (N)" (ver H15) |
| média | estados | `BlockWorkSection.tsx:295-307` | O erro do histórico da quadra só em texto | "Tentar novamente" |
| média | contraste | `BlockPanel.tsx:146-167` | `textSecondary` sobre o cabeçalho `surfaceSubtle` (4,34:1) | Cabeçalho `surface`, ou `#5F7088` |
| média | vocabulário/acessibilidade | `BlocksScreen.tsx:169, :158` | "Última visita"; o rótulo "Quadra N" esconde status e data | "Último trabalho"; rótulo completo |
| média | navegação | `TerritoryDetailScreen.tsx:97-119` | O detalhe da quadra é estado interno: o back físico sai do território inteiro (contra o UX-CONTRACT) | Rota `BlockDetail` no stack, ou `BackHandler` (ver H17) |
| baixa | vários | `PublisherPicker.tsx:38-45, :56`; `BlockWorkSection.tsx:329, :442-447, :350-354`; `BlockPanel.tsx:113-117, :97-99`; `BlocksScreen.tsx:228-315, :138`; `TerritoryDetailScreen.tsx:139-146` | Busca sem "Limpar"; "Apagando…" global; desabilitado a 1,48:1; data com cerca de 43 dp; título repetido; status sem amostra de cor; estilos mortos; nome do território três vezes; resumo sem Retirada, quadras e último trabalho | Reusar `QuerySearchField`; estado por linha; `disabledText`; `minHeight 48`; bolinha com `BLOCK_CATEGORY_COLOR`; remover duplicatas |

### PublishersScreen, PublisherHistoryScreen, HistoryScreen, Campanhas, SetupScreen
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | contraste | `PublisherHistoryScreen.tsx:160` | `dateLabel` em `textMuted` 11 dp sobre `surfaceSubtle` (2,34:1) | `textSecondary` (`#5F7088`, 4,61) |
| média | layout | `PublishersScreen.tsx:72-89, :112`; `CampaignsScreen.tsx:79-89, :113` | Busca e estados encostam nas laterais | `paddingHorizontal 16` |
| média | estados | `PublisherHistoryScreen.tsx:86-87` | Trocar de página troca a lista por um carregando e a tela salta | Manter a lista com `opacity 0.6` e a paginação desabilitada |
| média | acessibilidade | `HistoryScreen.tsx:234` | `accessibilityLabel` sem `accessible`, e o rótulo não traz datas nem situação | `accessible` e o rótulo completo |
| média | estados | `HistoryScreen.tsx:122-127` | Não valida "De" posterior a "Até" (o contrato exige) | Não consultar; explicar a correção |
| média | vocabulário | `CampaignsScreen.tsx:100` | "Ativa/Inativa" redundante e ambíguo | "Em andamento", "Concluída", "Não designada" (ver H16) |
| média | affordance | `CampaignDetailScreen.tsx:112-114, :146-153` | Territórios em cards que parecem tocáveis e não são | Lista plana, ou navegar ao `TerritoryDetail` |
| média | vocabulário | `CampaignDetailScreen.tsx:40-42` | "dd a em andamento" | "Retirada dd/mm/aaaa · Em andamento" |
| média | contraste de componente | `SetupScreen.tsx:281-285` | Borda do input = 1,13:1, campo invisível | Fundo `surface`, `borderInput #7b8ba1` (3,47) |
| baixa | vários | `PublishersScreen.tsx:92, :97`; `PublisherHistoryScreen.tsx:30, :102, :112, :121, :147, :160-171, :77`; `HistoryScreen.tsx:85, :143, :186, :194-202, :241, :272, :289`; `CampaignDetailScreen.tsx:101, :161, :164`; `SetupScreen.tsx:196, :214, :246, :250, :264, :287, :321` | "1 publicadores"; "Devolvido" e "Devolvida" misturados; "Devolução: —" no lugar de "Em andamento"; peso 800 em rótulos; sombras em repouso; títulos repetidos; sem "Limpar filtros"; raio 24; "Confirmar"; sem `RefreshControl` nas consultas | Plural; vocabulário canônico; 700; sem sombra; `RefreshControl` sem limpar a lista; "Entrar" |

### As três mudanças de maior efeito — admin-app/
1. **Um componente `Button` comum** (primário, secundário, perigo e discreto), com `minHeight 48`, desabilitado visível e `accessibilityState`. Ele substitui `headerButton`, os botões editar e apagar, "Sair", o checkbox e o retry vermelho, e resolve 6 dos 13 achados altos.
2. **Contraste nos tokens**:
   - `textSecondary` passa a `#5F7088`.
   - Novos `dangerText` e `borderInput`.
   - `textMuted` proibido em texto.
   - Tinta escura no número da quadra vencida.
   - Fonte de 11 na legenda e na atribuição do mapa.
3. **Estados assíncronos de Territórios e do cartão S-13**:
   - Recarregar sem apagar a lista.
   - Erro de ação separado do erro de carga.
   - "Tentar novamente" em todo erro de carga.
   - Paginação que não faz a tela saltar.
   - `ScrollView` no modal de edição.

---

## 3. admin/ — desktop (Electron)

Achados das capturas (`inspect.mjs --app` sobre dados de exemplo) somados à leitura completa de `index.css`, `query-controls.css`, `components/` e de todas as telas. Os caminhos são relativos a `admin/src/renderer/`.

O inspector deu FAIL `button-fx` (botões com sombra) em todas as telas. Também deu `hero-void` em Campanhas (61% da tela vazia) e em Publicadores (36%), `contrast` em Territórios e Campanhas (3,5:1) e `numeric-align` em Territórios (12 de 12 células numéricas alinhadas à esquerda).

### Global: `index.css`, `query-controls.css`, `components/`
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | contraste | `index.css:57` (`--text-tertiary #7b8aa0`), usado em `.cell-sub :2393`, `.cell-muted :2400`, `.block-status-forced :2780` | Datas relativas, "Sem dirigente" e "(forçado)" ficam entre 3,10 e 3,51:1 | As classes passam a usar `#5a6b83` (5,43:1 no branco, 4,79:1 na seleção). `--text-tertiary` fica só para ícones. |
| média | contraste | `index.css:1098-1107, 1183, 1252` | "Em andamento" 4,22:1; "Devolvido" 4,43:1; revogado 4,47:1; avatar inativo 4,27:1 | warning `#955b0e` (5,25), success `#1f7642` (5,25), neutros com o secundário novo |
| média | contraste não-texto | `index.css:364-372`, `query-controls.css:16` | Borda de input e de busca a 1,28:1 | Token `--border-control #8696ab` (3,02) |
| média | semântica | `index.css:810` × `:1098`; `HistoryScreen.tsx:243` × `PublishersScreen.tsx:613` | "Em andamento" aparece azul numa tela e âmbar em outra; "Devolvido" é cinza numa e verde na outra | Um selo de situação só: âmbar para em andamento, neutro para devolvido |
| média | tokens | `index.css:249-253, 296, 333, 451-472, 502, 527, 578, 687, 697, 806-812, 850-852, 1177-1184, 1238-1253, 1869, 2249` | Hex soltos fora do `:root`; dois verdes diferentes para o mesmo aviso | Usar `--intent-*`; tokens novos `--intent-info*` e `--neutral-surface` |
| média | tokens | `index.css:54, 251, 557, 696, 710` | `--radius-sm 6px` contradiz o DESIGN.md (4); há literais de 6, 16 e 20 | 4/8/12/pill |
| média | tokens | `index.css` (12px 50 vezes, 10px 39, 6px 29, 14px 28, 20px 13; 22 e 36) | Espaçamento fora da escala | Registrar o 12 no DESIGN.md; normalizar 10/14 para 8/12/16, 20/22 para 24 e 36 para 32 |
| média | tokens | `index.css:1288, 1306, 1437-1444, 1855, 1909, 1975`; `query-controls.css:26-66` (29 sombras no lint) | Sombra em card e botão em repouso | Sombra só em diálogo, menu e painel de detalhe |
| média | tokens | `query-controls.css:115-126`; `index.css:1057-1070, 1454, 2546` | Cabeçalho de tabela e rótulos de KPI em caixa alta com faixa | Sentence case 13/600 em `--text-secondary`, sem faixa, com borda inferior |
| média | dados | `index.css:2381`; `DesignationsScreen.tsx:337`; `TerritoryDetailDialog.tsx:510-520`; `HistoryScreen.tsx:228,234` | Números alinhados à esquerda; datas sem `tabular-nums` | `.cell-number { text-align: right; font-variant-numeric: tabular-nums }` |
| média | conteúdo | `CampaignsScreen.tsx:44`, `DesignationsScreen.tsx:43`, `TerritoryDetailDialog.tsx:39`, `HistoryScreen.tsx:15`, `HomeScreen.tsx:22`, `TerritoryBlocksTab.tsx:31` | `toLocaleDateString()` sem `'pt-BR'`: num sistema em inglês sai mm/dd | Um `formatDate` compartilhado em pt-BR |
| média | diálogos | `App.tsx:218`; `CampaignsScreen.tsx:265,284,306,317`; `TerritoryDetailDialog.tsx:175`; `HomeScreen.tsx:193`; `PublishersScreen.tsx:296`; `HistoryScreen.tsx:126`; `TerritorySettingsScreen.tsx:175` | `window.confirm` nativo. O DESIGN.md pede "diálogos do aplicativo" | `ConfirmDialog` sobre o `Dialog`, com os mesmos textos e o botão de perigo nomeando a consequência |
| média | hierarquia | `Dialog.tsx:95`; `index.css:791,1005,1838,2476,3068` | Até três eyebrows por tela ("GESTÃO DE TERRITÓRIO", "MAPA DA CONGREGAÇÃO", "DESENHO E QUADRAS", "CONSULTA DA CONGREGAÇÃO") | No máximo um, o da sidebar |
| média | tokens | `.app-sidebar .is-active` | Item ativo com fundo azul e barra à esquerda (acento no chrome) | Pílula neutra com o texto em 600 |
| média | tokens | `index.css:687, 997` | Gradientes (lint FAIL). O de `.setup-screen` é decoração | Fundo plano. O do cabeçalho de contexto (997) é tolerável. |
| baixa | tipografia | `index.css:1317` | `.sidebar-product` com cerca de 9,9px | 11px |
| baixa | manutenção | `index.css:823/2398, 829/2188, 621/2213, 448/2255, 467/2244, 1139/2881, 772/2320, 1538-1574, 690-697, 2744, 1967, 378-384` | Classes duplicadas ou contraditórias, regras mortas, `top: 66px` mágico, primário por `:last-child`, foco antigo | Consolidar uma definição por classe; `.button-primary` explícito |
| baixa | acessibilidade | `components/DataTable.tsx:104-108, 143` | A tabela vira parada de Tab mesmo sem overflow; `aria-selected` num `tr` | `tabIndex` só quando há overflow; `aria-current` |
| baixa | consistência | inspector `font-count` | O Leaflet traz Helvetica | `font-family: inherit` em `.leaflet-container` |

### App.tsx e HomeScreen (seção "Mapa")
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| média | hierarquia | `HomeScreen.tsx:257` | O h1 é "Congregação X — Cidade" (repete a sidebar), herda 17,6px e a tela fica sem nome | h1 "Mapa" com 20px e subtítulo de contagem (ver H7) |
| média | conteúdo | captura `home/desktop-fold` (lista lateral) | Data do último trabalho cortada ("09/10/202"); pílula "Designado a Ana ..." truncada; texto a 6–8px da borda em 768 (inspector `edge-text`) | Data em `nowrap` numa linha própria; dirigente em texto na segunda linha |
| média | estados | `HomeScreen.tsx:269-270` | Carregando é um `<p>` sem `role="status"` e o painel some; o erro não tem "Tentar novamente" | Manter a geometria; botão de retry |
| média | fluxo | `HomeScreen.tsx:377-387` | Os atalhos repetem o menu ⋮; "Quadras" abre o editor de adicionar quadra | "Adicionar quadra", ou só o menu (ver H18) |
| média | diálogo | `HomeScreen.tsx:407-421`; `index.css:585-603` | O modal da quadra tem cabeçalho duplicado com "×" e o véu sobe para 0,70 de opacidade | `closeLabel="Fechar"`; remover o cabeçalho manual e a sombra extra |
| média | navegação | `App.tsx:270-271` | "Mapa" (desenho) na sidebar e "Mapa" como modo de Territórios significam coisas diferentes | Renomear a seção (ver H19) |
| baixa | consistência | `HomeScreen.tsx:259-265` e outras telas | "Recarregar" aparece só com texto, só com ícone ou com os dois | Ícone com o texto "Atualizar" (ver H8) |
| baixa | vários | `HomeScreen.tsx:288, 302, 321, 419`; `App.tsx:124` | Vazio sem orientação; "⋮" e "×" como caracteres; boot sem shell | `Icon`; `aria-haspopup="menu"` |

### DesignationsScreen (Territórios) e TerritoryDetailDialog
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | layout | `DesignationsScreen.tsx:556-560`; `index.css:1737` × `.dialog-xl:2439-2440` | O modal de importação S-13-T fica com 1040px e padding 0, conteúdo colado na borda | Tamanho md/lg com padding |
| média | hierarquia | `DesignationsScreen.tsx:390-398` | A primária da tela é "Exportar S-13-T"; três botões de arquivo competem com a consulta | Os três como secundários (ver H20) |
| média | hierarquia | `DesignationsScreen.tsx:408-428, 567-582` | Faixa de 4 KPIs em cards que repete o resumo, e "Cobertura" com medidor é métrica decorativa | Remover a faixa; contagens nos segmentos ("Em andamento (10)") (ver H21) |
| média | estados | `DesignationsScreen.tsx:403` | Erro de recarga sem "Tentar novamente" | Botão de retry |
| média | acessibilidade | `TerritoryDetailDialog.tsx:397-412, 405×417` | Abas sem setas nem tabindex rotativo; `aria-controls` aponta para um painel ausente | Padrão de tabs ARIA |
| média | estados | `TerritoryDetailDialog.tsx:150→395, 326, 591` | Erro de carga sem retry; as ações do dirigente somem sem explicação; o erro de edição não é anunciado | Retry; `role="alert"` com `aria-describedby` |
| baixa | conteúdo | `DesignationsScreen.tsx:367, 414, 444, 461, 499-624, 602`; busca | "designados", "Designados" e "Em andamento" misturados; Title Case em rótulos; "em aberto"; no modo Mapa sem resultado a tela cai em silêncio para a tabela; placeholder cortado ("Nome, número, diriger") | Vocabulário canônico; sentence case; manter o modo e mostrar o sem-resultado |
| baixa | consistência | `TerritoryDetailDialog.tsx:488-556, 478, 594`; `index.css:2596-2605` | Tabela feita à mão; "Designar"; "Dirigente responsável"; `.dot-*` repete os hex de `blockColor.ts` | `DataTable`; "Designar publicador"; uma fonte só para as cores (os valores não mudam) |

### CampaignsScreen, CampaignEditorDialog, CampaignPublishersDialog (spec 0017)
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| alta | layout | `CampaignEditorDialog.tsx:95`; `index.css:2439-2440, 3191, 3231` | Diálogo xl com padding 0 e `overflow: hidden`, lista e mapa sem `min-height: 0`: em janela baixa "Criar campanha" e "Cancelar" ficam fora de alcance | Cabeçalho, corpo rolável com padding de 24 e rodapé fixo; `closeLabel="Fechar"` |
| alta | fluxo | `CampaignsScreen.tsx:386`; `index.css:2979-2985`; captura `campanhas` | Sem seleção, 61% da tela fica vazio e o nome da campanha é truncado numa coluna de 24rem | O detalhe vazio diz o próximo passo ("Escolha uma campanha…"), ou já vem selecionada a primeira |
| média | estados | `CampaignsScreen.tsx:370-372, 374-383, 395` | Carregando sem geometria; vazio sem ação; sem resultado sem "Limpar busca" | Estados do `DataTable` e ação contextual |
| média | hierarquia | `CampaignsScreen.tsx:351, 485` | Duas primárias ("Nova campanha" e "Designar…") | Uma primária por tela (ver H22) |
| média | fluxo | `CampaignsScreen.tsx:424` | O detalhe não fecha nem com botão nem com Escape | "Fechar" e Escape, devolvendo o foco à linha |
| baixa | consistência | `CampaignsScreen.tsx:479, 541, 564-593`; `CampaignEditorDialog.tsx:77, 115, 155, 184-191` | "Marcar como concluída" (registrar a concordância); "Dirigente:"; tabela feita à mão; "Escolher pela"; botão desabilitado sem explicar por quê | "Dirigente atual"; `DataTable`; "Visualização"; dizer o que falta |

### PublishersScreen, HistoryScreen, TerritorySettingsScreen, SetupScreen e outras
| Sev. | Categoria | Onde | Achado | Correção |
|---|---|---|---|---|
| média | consistência | `PublishersScreen.tsx:387-394`; `index.css:1139-1146` | Busca em pílula sem rótulo e sem "Limpar" | `SearchField label="Buscar publicadores"` |
| média | estados | `PublishersScreen.tsx:380, 382, 403, 555-562` | Carregando é um `progressbar` vazio; erro sem retry; sem resultado sem "Limpar"; o painel não fecha com Escape | Padrão de consulta |
| média | layout | captura `publicadores` | Linhas-card de 1180px com cerca de 900px vazios no meio (inspector `hero-void` 36%) | Lista em largura de leitura com o detalhe ao lado (UX-CONTRACT) |
| média | hierarquia | `TerritorySettingsScreen.tsx:196`; `BlockHistorySheet.tsx:102` | Telas sem h1 (o título é um h2 de 17,6px) | h1 de 20px |
| média | acessibilidade | `SetupScreen.tsx:84, 104-132` | Sem heading; os erros de campo não estão ligados ao input | `h1.sr-only`; `aria-describedby` |
| média | contraste | `map/AssignmentsMap.tsx:128-137` | Estilos inline com hex; "Sem dirigente" a 3,35:1 | Classes CSS e o secundário novo |
| baixa | conteúdo | `PublishersScreen.tsx:468-471, 549-550, 608, 684-690, 374-378` | Selos com a frase inteira ("Ativo neste aparelho."); hierarquia h2/p invertida; "—" no lugar de "Em andamento"; "Copiar" sem confirmação; alerta que não fecha | Selo curto (ver H9); `aria-live` com "Código copiado" |
| baixa | conteúdo | `HistoryScreen.tsx:234, 248, 273`; paginação | "—" no lugar de "Em andamento"; cabeçalho "Ações" visível; a paginação some no carregando; "Página anterior/Próxima página" | Vocabulário; manter a paginação desabilitada (ver H10) |
| baixa | vários | `TerritorySettingsScreen.tsx:25, 233, 244, 265-326`; `BlockHistorySheet.tsx:110, 126-144`; `TerritoryBlocksTab.tsx:146, 179`; `TerritoryEditorScreen.tsx:166, 175` | "Recente" × "Em dia"; "Designado a"; tabela legada; "Remover" × "Apagar"; erros sem `role="alert"`; "Apagar tudo" sem estilo de perigo | Vocabulário canônico; estilos de perigo; ligar os erros aos campos |

### As três mudanças de maior efeito — admin/
1. **Consertar os diálogos xl** (editor de campanha e importação S-13-T): cabeçalho, corpo rolável com padding e rodapé fixo com Fechar. Hoje as ações podem ficar inalcançáveis.
2. **Tokens AA e uma semântica de situação só**:
   - `--text-tertiary` fora do texto.
   - warning, success e secondary escurecidos.
   - `--border-control` novo.
   - Sem gradiente e sem sombra em repouso.
   - Um único selo "Em andamento" e "Devolvido" em todas as telas.
3. **O mesmo padrão de consulta em todas as telas**:
   - `SearchField` e `DataTable`.
   - Carregando que mantém a geometria; erro com "Tentar novamente"; sem resultado com "Limpar".
   - Escape fecha os detalhes.
   - h1 de 20px nomeando cada tela.
   - Datas em pt-BR, números tabulares à direita.
   - Detalhe vazio de Campanhas.

---

## 4. Mudanças que mexem no hábito do usuário (precisam de aprovação)

| # | Cliente | Mudança | Motivo |
|---|---|---|---|
| H1 | app | **Abrir direto no mapa** em vez do Início. O Início passa a ser alcançado por um botão no cabeçalho do mapa | O AGENTS.md ("abre e já mostra a posição do usuário no mapa") e a spec 0018 pedem; hoje `App.tsx:332` abre o Dashboard |
| H2 | app | Na aba Visão geral, **"Designados a você" sobe para o topo**, acima de "Trabalhados" | A tela deve responder primeiro "onde trabalho hoje" |
| H3 | app | **Renomear as abas e seções**: "Meus Territórios" vira "Início", "Território(s) designado(s)" vira "Designados a você", "Histórico de Trabalho" vira "Histórico" | Vocabulário e caixa consistentes; o título do cabeçalho deixa de repetir a aba |
| H4 | app | O botão do modal de marcar **"Confirmar" vira "Marcar como trabalhada"** | O UX-CONTRACT pede uma ação que descreva o resultado |
| H5 | app | O botão da ativação **"Confirmar" vira "Ativar acesso"** | O mesmo motivo; é usado uma vez só, impacto baixo |
| H6 | app | **Remover a saudação "Olá, nome" e a faixa de números** do Início; os números passam ao subtítulo de cada seção | Padrão de dashboard genérico, números sem unidade |
| H7 | admin | O h1 do Mapa **deixa de ser o nome da congregação** e passa a ser "Mapa" | A sidebar já nomeia a congregação |
| H8 | admin | **Atualizar unificado**: "Recarregar" (texto) e o ícone só passam a ser um botão "Atualizar" com ícone e texto | Dois padrões para a mesma ação |
| H9 | admin | Pílulas de Publicadores encurtadas ("Ativo neste aparelho." vira "Ativo") | A frase longa vai para o detalhe |
| H10 | admin | Paginação: "Página anterior / Próxima página" vira "Anterior / Próxima" | Vocabulário do UX-CONTRACT |
| H11 | admin-app | No mapa, tocar um território passa a abrir a aba **Quadras**, não Designações | Realinha a decisão de 2026-08-26 do AGENTS.md |
| H12 | admin-app | "Quadras" na linha deixa de abrir o overlay com "← Voltar" e passa a abrir o detalhe do território na aba Quadras, pelo stack | Um caminho só, que também apaga o registro |
| H13 | admin-app | "Marcar como concluído" sai do rodapé e vai para dentro do card da designação atual, como secundário | Fica junto do que encerra; acaba com os dois primários |
| H14 | admin-app | "Apagar" a designação se afasta de "Editar" | É ação irreversível |
| H15 | admin-app | O seletor de publicador mostra o selecionado e até 8 resultados, com "Mostrar todos (N)" | As ações principais estavam fora da tela |
| H16 | admin-app | Renomear "Confirmar" para "Entrar", "Designação atual" para "Dirigente atual", "Data de início/conclusão" para "Retirada/Devolução", "Última visita" para "Último trabalho", "Ativa/Inativa" para "Em andamento/Concluída/Não designada" e "Designar" para "Designar publicador" | Vocabulário do UX-CONTRACT |
| H17 | admin-app | O back físico no detalhe da quadra volta às quadras em vez de sair do território | É o que o UX-CONTRACT pede |
| H18 | admin | Atalho "Quadras" na lista do Mapa vira "Adicionar quadra", ou os atalhos que repetem o menu ⋮ saem | O rótulo não diz o resultado |
| H19 | admin | A seção "Mapa" da sidebar é renomeada (por exemplo "Demarcações") | Colide com o modo Mapa de Territórios |
| H20 | admin | "Exportar S-13-T" deixa de ser o botão primário de Territórios (mesma posição, peso menor) | Arquivo não é a tarefa principal da consulta |
| H21 | admin | Sai a faixa de KPIs de Territórios (Territórios, Designados, Livres, Cobertura); as contagens vão para o resumo e os segmentos | Métrica decorativa, repete o resumo |
| H22 | admin | Em Campanhas, "Nova campanha" ou "Designar…" perde o destaque de primário | Uma primária por tela |
| H23 | admin | Renomear "Cadastrar" para "Cadastrar publicador", "Designar" para "Designar publicador", "Remover" para "Apagar" e "Recente" para "Em dia" | Vocabulário do UX-CONTRACT |
| H24 | admin | As confirmações nativas (`window.confirm`) viram diálogos do app, com o mesmo texto | Muda a aparência de toda confirmação destrutiva |

---

## 5. Tokens que faltam no DESIGN.md

**Versão mobile (Android), necessária para a Task 02:**

| Token | Valor proposto | Por quê |
|---|---|---|
| `canvas-mobile` | `#F8FAFC` (já existe) e também `surface-subtle`. `text-secondary` pode descer a `#5A6B83` para fechar AA também sobre `primary-soft` (o `#5F7088` dá 4,45:1 ali) | Hoje o app usa `#f1f5f9`, que derruba o contraste do texto secundário |
| `text-placeholder` | `= text-secondary #5F7088` | O placeholder precisa de 4,5:1; `#94a3b8` dá 2,3–2,6 |
| `danger-surface`, `success-surface`, `warning-surface` | `#FFF1F0`, `#EEFAF1`, `#FFF8E8` | Existem no admin (`index.css:32-34`) e não estão no DESIGN.md |
| `success-ink`, `warning-ink` (texto de pílula) | `#1F7642`, `#955B0E` (5,25:1 cada) | `success` e `warning` não fecham 4,5:1 sobre as próprias superfícies |
| `touch-target` | mínimo 44 dp, padrão 48 dp para botões primários | O DESIGN.md cita 44 dp, mas não há token |
| `type-mobile` | título 20/700, seção 16/600, corpo 15/400, meta 13/400, mínimo 12 (11 só no rótulo do mapa) | Não há escala mobile; hoje são 7 tamanhos soltos |
| `radius-sheet` | 16 só nos cantos de cima da folha inferior | Caso único sem token |
| `shadow-sm`, `shadow-md` | definir os valores (citados no DESIGN.md sem valor). Mobile: `elevation` 2 e 6 | Os três clientes usam valores diferentes |
| `scrim` | `rgba(16,35,63,0.5)` | Overlay de modal sem token |
| `map-overlay` | superfície `#FFFFFF` a 94%, borda `border`, `shadow-md` | Controles sobre o mapa (filtros, legenda, card) |
| `map-label-ink` | `#10233F` sobre fundo claro; tinta escura no número da quadra vencida | O texto sobre as cores de domínio precisa de regra de tinta, sem mudar as cores |

Tokens adicionais apontados nos admins:

| Token | Valor | Por quê |
|---|---|---|
| `danger-text`, `border-input` | `#B91C1C` (5,91:1 sobre `danger-surface`), `#7B8BA1` (3,47:1 como borda) | Texto de erro e borda de campo dentro do AA |
| `status-pill` | em andamento = warning; devolvido = success ou neutro; livre = neutro; campanha = primary-soft | "Em andamento" tem três cores diferentes entre telas e clientes |
| `fontSize` / `fontWeight` | caption 11, small 12, body 14, bodyLg 16, title 20, display 24; pesos 400/500/600/700 | Não há escala no `theme.ts` dos dois apps |

**Para todos:** `text-tertiary` (o admin usa `#7b8aa0`, abaixo de AA: corrigir ou remover), `border-strong`, `selection-text`, motion (`ease-out`, `duration-fast 150ms`, `duration-base 200ms`), backdrop, `border-control` (`#8696ab`, 3:1), `intent-info` e `neutral-surface`, passo de espaçamento de 12px (o mais usado no CSS), escala de tipo do desktop (11 a 22px, h1 de tela 20px), alturas de controle (30/36/42), anel de foco e z-index. Todos já existem no `index.css` e não estão no DESIGN.md. Alinhar `rounded.sm`: o DESIGN.md diz 4px e o CSS usa 6px.

---

## Contagem de achados

| Cliente | Alta | Média | Baixa | Total |
|---|---|---|---|---|
| app/ | 13 | 25 | 8 | 46 |
| admin-app/ | 13 | 36 | 37 | 86 |
| admin/ | 5 | 33 | 43 | 81 |
