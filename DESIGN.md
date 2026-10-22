---
version: alpha
name: "Territory Map"
description: "Administração cartográfica serena, com consultas densas e movimentos territoriais legíveis."
colors:
  primary: "#155FC0"
  primary-strong: "#124F9F"
  primary-soft: "#EAF1FF"
  canvas-desktop: "#F3F6FA"
  canvas-mobile: "#F8FAFC"
  surface: "#FFFFFF"
  surface-subtle: "#F8FAFC"
  text-primary: "#10233F"
  text-secondary: "#5A6B83"
  border: "#DCE4ED"
  focus: "#1769D1"
  success: "#25834A"
  warning: "#AA6812"
  danger: "#C63D37"
  # Spec 0018 (Task 02): tokens that already existed in the clients and were
  # missing here. None changes a value the admins already use.
  danger-surface: "#FFF1F0"
  success-surface: "#EEFAF1"
  warning-surface: "#FFF8E8"
  success-ink: "#1F7642"
  warning-ink: "#955B0E"
  danger-text: "#B91C1C"
  border-strong: "#B8C6D6"
  border-input: "#7B8BA1"
  border-control: "#8696AB"
  text-placeholder: "#5A6B83"
  text-tertiary: "#7B8AA0"
  selection-text: "#123F80"
  scrim: "rgba(16, 35, 63, 0.5)"
  map-overlay: "rgba(255, 255, 255, 0.94)"
  map-label-ink: "#10233F"
typography:
  interface:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
  data:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
  mobile:
    title: "20/700"
    section: "16/600"
    body: "15/400"
    meta: "13/400"
    small: "12/400"
    map-label: "11/600"
rounded:
  DEFAULT: "0.5rem"
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
  pill: "9999px"
  sheet: "1rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  ms: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
shadows:
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)"
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)"
  mobile-sm: "elevation 2"
  mobile-md: "elevation 6"
motion:
  ease-out: "cubic-bezier(0.2, 0.8, 0.2, 1)"
  duration-fast: "150ms"
  duration-base: "200ms"
touch-target:
  min: "44dp"
  primary: "48dp"
components:
  navigation: {}
  query-list: {}
  data-table: {}
  movement-ledger: {}
  dialog: {}
---

# Territory Map Design System

## Overview

### Creative North Star

Uma mesa cartográfica contemporânea: áreas e movimentos devem ser lidos com a precisão de um
registro operacional, sem transformar o produto em uma planilha crua. A referência funcional é o
cartão S-13 e a organização por áreas do aplicativo Territórios da Congregação; a aparência é
própria e atual.

### Product context and register

- **Público e trabalho principal:** o responsável pelos territórios consulta, designa e corrige o
  histórico da congregação no computador e em campo no Android.
- **Mercado e evidência:** congregações de língua portuguesa no Brasil; `PRODUCT.md` e `AGENTS.md`
  são as fontes do domínio.
- **Idioma:** português do Brasil, datas em `pt-BR` e vocabulário canônico de `UX-CONTRACT.md`.
- **Cena de uso:** trabalho denso de mesa no desktop e consulta rápida, sob toque, no Android.
- **Registro:** produto administrativo. Clareza, rastreabilidade e familiaridade vencem expressão.
- **Assinatura:** o histórico é um **registro de movimentos territoriais** — retirada, trajeto no
  tempo e devolução — e não uma lista genérica de cartões.
- **Contenção:** mapas, tabelas, formulários e ações destrutivas permanecem discretos e previsíveis.
- **Antirreferências:** dashboard de métricas decorativas, cards excessivamente grandes, gradientes
  de marketing e tabelas sem contenção ou hierarquia.
- **Tokens:** modelo B. Os tokens canônicos de execução continuam em
  `admin/src/renderer/index.css` e `admin-app/src/presentation/theme.ts`; este arquivo espelha seus
  papéis e registra a intenção. Cada superfície adapta densidade sem mudar semântica.

## Colors

Azul identifica navegação, seleção e ações primárias. Superfícies brancas sobre canvas azul-cinza
organizam a densidade; bordas fazem a maior parte do trabalho de separação, e sombras são leves.
Verde, âmbar e vermelho são reservados a sucesso, andamento/atenção e perigo. Nenhum estado depende
somente da cor. O foco usa `focus` com contraste visível. As cores próprias do estado das quadras
continuam no domínio e não pertencem a esta paleta de interface.

### Contrast rules (spec 0018)

Every tier that carries words reaches 4.5:1 on the surface it sits on, placeholders included.

- `text-secondary` (`#5A6B83`) passes on `surface` (5,43:1), `surface-subtle` and `primary-soft`
  (4,79:1). It replaced `#5F7088`, which fell to 4,45:1 on the selected/blue-soft tint.
- `text-placeholder` = `text-secondary`. Lighter greys (`#94A3B8`, 2,3–2,6:1) are banned as text.
- `text-tertiary` (`#7B8AA0`, 3,10–3,51:1) is **non-text only** (icons, decorative rules). The
  admin desktop still uses it for `.cell-sub`, `.cell-muted` and `.block-status-forced`; those
  classes must move to `text-secondary` (audit 0018, admin global, first row).
- `success` and `warning` do not reach 4.5:1 on their own surfaces (4,43 and 4,22:1): text on
  those surfaces uses `success-ink` / `warning-ink` (5,25:1 each). `danger` on `danger-surface`
  passes (4,63:1); `danger-text` (5,91:1) is the stronger ink the admin app adopts.
- Input and control edges need 3:1 against their background: `border-input` (3,47:1) on mobile,
  `border-control` (3,02:1) on desktop. `border` (`#DCE4ED`) only separates surfaces.
- Over the block-status colours of the map (domain, unchanged) the number ink is chosen per
  colour: white on red and green, `map-label-ink` on the overdue orange (5,11:1; white there is
  3,08:1).

### Mobile (Android)

The two Android apps use the same palette with `canvas-mobile` as the screen ground and white
surfaces bordered by `border`. Controls 8 dp, panels 12 dp, chips full, and `sheet` (16) only on
the top corners of a bottom sheet. Type follows `typography.mobile`; nothing under 12 except the
map's own labels and attribution (11). Every pressable control is at least `touch-target.min`
(44 dp) tall; primary buttons use `touch-target.primary` (48 dp). Headers are light (`surface`,
`text-primary` title 18/700, bottom edge), never filled with `primary`. Shadows (`mobile-sm`,
`mobile-md`) are only for what floats: the card over the map, a modal, a map overlay. Controls over
the map (legend, labels, attribution) sit on `map-overlay` with a `border` edge. Modals use `scrim`.

`rounded.sm` is 4 px here; the admin desktop still uses 6 px (`--radius-sm`) and should align.

## Typography

A pilha nativa mantém leitura consistente entre Electron e Android. Títulos usam peso 700–800;
texto operacional usa 400–600. Rótulos curtos de dados podem usar caixa alta, espaçamento moderado
e tamanho mínimo de 11 px/dp. Datas e contagens usam algarismos tabulares no desktop. O produto não
usa fonte display decorativa: os nomes de território e publicador são o conteúdo de maior ênfase.

## Layout

O desktop usa navegação lateral e workspaces mestre–detalhe. Listas longas e tabelas possuem sua
própria rolagem; cabeçalhos, busca e ações permanecem estáveis. Abaixo de 900 px, o detalhe empilha
depois da lista. O Android tem uma única rolagem por tela, safe area e alvos mínimos de 44 dp. O
ritmo deriva de 4, 8, 16, 24 e 32; áreas densas usam 8–16, enquanto separações de seção usam 24–32.

## Elevation & Depth

Hierarquia nasce primeiro de superfície, borda e espaçamento. `shadow-sm` distingue cards móveis e
linhas elevadas; `shadow-md` é permitido no painel de detalhe e em overlays. Tabelas internas e
cards aninhados permanecem planos. Gradiente só pode aparecer como variação tonal muito discreta em
cabeçalhos de contexto, nunca como decoração de página.

## Shapes

Controles usam 8 px, painéis 12 px e chips usam raio completo. Avatares são circulares. Bordas têm
um pixel e cantos não devem competir com a geometria real dos mapas. Ações por ícone exigem nome
acessível; quando há espaço, texto permanece visível.

## Components

### Foundational visual states

Hover clareia a superfície e preserva contraste; foco usa anel azul; seleção combina fundo azul
suave, borda e estado semântico. Desabilitado reduz contraste e impede interação. Loading mantém a
geometria; vazio, sem resultado e erro explicam o próximo passo.

### Buttons and actions

Primário sólido é reservado ao compromisso principal. Secundário usa superfície e borda; ações
quietas não competem com conteúdo. Perigo fica separado e nomeia a consequência. Estados ocupados
mantêm a dimensão original.

### Navigation and data display

Sidebar e tabs sempre combinam texto com seleção visual. Tabelas são semânticas, têm cabeçalho
persistente quando roláveis e evitam colunas redundantes com o contexto do detalhe. No Android, o
mesmo registro vira cards densos, nunca uma tabela espremida. O componente de histórico mostra
território, retirada, devolução e situação nessa ordem.

### Forms and overlays

Campos têm rótulo acessível e foco visível. Busca oferece limpeza quando preenchida. Diálogos são
do aplicativo, restauram foco e mantêm ações destrutivas explícitas. Painéis de detalhe preservam a
lista que os abriu.

### Iconography

Ícones usam geometria simples e reconhecível, desenhada localmente quando o cliente não possui uma
biblioteca vinculada. Tamanho padrão entre 20 e 24 px/dp. Ícone não substitui rótulo de uma ação
administrativa ambígua.

### Motion

Movimento comunica troca de estado ou abertura de detalhe; não decora consultas rotineiras.
Transições devem ser curtas, interrompíveis e respeitar redução de movimento.

### Content and data visualization

A voz é direta e serena. Usar `Retirada`, `Devolução`, `Em andamento` e `Histórico de territórios`.
Datas são `dd/mm/aaaa`; totais explicitam a unidade. Mapas sempre oferecem alternativa textual de
consulta quando a tarefa não depende do desenho.

## Do's and Don'ts

- **Faça:** trate o histórico como movimentos datados de um território.
- **Faça:** mantenha informação equivalente e vocabulário comum no desktop e no Android.
- **Não faça:** repetir a identidade do publicador em cada linha quando o detalhe já é filtrado por ele.
- **Não faça:** deixar uma lista ou tabela crescer sem rolagem, paginação ou limite explícito.
- **Não faça:** usar cards, sombras ou cores como decoração sem significado operacional.
