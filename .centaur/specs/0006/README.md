# [0006] Redesign do admin: sidebar, página de Designações e fluxos de quadra/publicadores

**Data:** 2026-08-17
**Status:** Concluída
**Solicitação original:** "Pode melhorar o design do admin? melhorar o fluxo de cadastro de
quadras, gestão dos usuários e uma página separada também para designações (Nesta seria melhor se
mostrasse no mapa as demarcações dos territórios (sem mostrar as quadras), e mostrasse o nome do
dirigente por cima. E ao clicar nela pudesse editar.)"

## Decisões já tomadas com o usuário

- **Navegação por sidebar fixa**: barra lateral permanente com as seções **Mapa** (a Home atual),
  **Designações** (página nova) e **Publicadores**, com **"Sair da congregação" no rodapé** da
  sidebar. Os editores de território/quadra e o histórico continuam como telas empurradas com
  "← Voltar", renderizadas na área de conteúdo (a sidebar permanece visível).
- **Fluxo de quadras**: (a) layout lado a lado — painel compacto à esquerda (número, dicas,
  botões) e mapa grande à direita ocupando o resto da tela; (b) sequência automática de número —
  depois de salvar uma quadra em modo de criação, o campo já sugere o próximo número (salvo + 1,
  editável). A opção "atalho direto do mapa da Home" foi **descartada** pelo usuário.
- **Cor primária do admin muda de verde (#2e7d32) para azul #1565c0** — o mesmo azul do contorno
  dos territórios e a primária que o app do publicador já usa (implements/0101). O verde continua
  existindo apenas como cor de status "quadra recente" no mapa.
- **A ação "Atribuir a publicador" sai do menu "⋮" da Home** — designação passa a viver
  exclusivamente na página de Designações.

## Objetivo

Ao final desta spec o admin tem: uma sidebar de navegação permanente (Mapa / Designações /
Publicadores, com Sair no rodapé e o nome da congregação no topo); uma página de **Designações**
com um mapa que mostra só as demarcações dos territórios (sem quadras), o nome do dirigente
sobreposto a cada território (ou "Sem dirigente"), e clique no território abrindo o diálogo de
atribuição; o editor de quadras em layout lado a lado com sequência automática de numeração; a
tela de Publicadores com busca por nome e contadores; e a identidade visual azul consistente com o
app. Toda a suíte do admin continua verde.

## Contexto técnico

Tudo nesta spec é **Renderer** do admin (`admin/src/renderer/`) — nenhum arquivo de `main/`,
`preload/`, `shared/` ou do servidor muda. A designação já existe de ponta a ponta
(`window.api.territories.assign`, implements 0093/0096/0097); a página nova só **consome** esses
canais. Arquivos-chave:

- `admin/src/renderer/App.tsx` — `AuthenticatedApp` é o roteador manual (estado `route`); é aqui
  que a sidebar entra. `mapView` (pan/zoom da Home) e `fallbackCenter` já vivem neste nível e não
  devem ser perdidos.
- `admin/src/renderer/screens/HomeScreen.tsx` — hoje tem header próprio com "Publicadores",
  "Recarregar" e "Mais opções"→"Sair da congregação", além do diálogo de atribuição que vai migrar.
- `admin/src/renderer/screens/BlockEditorScreen.tsx` — formulário empilhado sobre um mapa de
  480px; vira split lado a lado. Desde a spec 0004 ele permanece montado após salvar (não
  navega), o que já preserva a posição do mapa — não regredir isso.
- `admin/src/renderer/map/TerritoryMap.tsx` — referência de como desenhar polígonos/markers com
  react-leaflet (centroide médio, DivIcon, `fallbackCenter`). O componente novo `AssignmentsMap`
  segue esse padrão.
- `admin/src/renderer/index.css` — todo o CSS global; a variável `--color-primary` é a alavanca
  da troca verde→azul.

Testes: Vitest + RTL, co-localizados, suíte hoje com 318 testes verdes. `npm test`,
`npm run typecheck`, `npm run lint` precisam passar ao fim de cada task. Nos testes de tela que
envolvem o mapa, o padrão é mockar o componente de mapa via `vi.mock` quando for preciso disparar
interações dele (clique em território), como descrito na Task 03 — o mapa em si segue o "risco
assumido" já documentado (sem teste próprio, como `TerritoryMap`).

## Tasks

### Task 01 — CSS: primária azul e estilos do shell com sidebar

**Objetivo:** A base visual da spec: paleta azul e as classes do novo layout com sidebar.
**Camadas:** Renderer (admin) — só CSS
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0006 — Task 01: Em `admin/src/renderer/index.css`: (1) troque a identidade primária de
> verde para azul — `--color-primary: #1565c0`, `--color-primary-dark: #0d47a1` — e revise os
> tons derivados que hoje assumem verde (`.setup-screen` gradient, `.setup-mark`, `.avatar`,
> `.setup-card` box-shadow, `a`): todos passam a usar tons de azul equivalentes (ex.: fundo de
> avatar `#dbe7f5`, texto `var(--color-primary-dark)`). O verde `#2e7d32` não deve sobrar em
> nenhuma regra do CSS global (ele continua existindo só dentro de `TerritoryMap.tsx`, como cor
> de status de quadra — não toque nos componentes). (2) Adicione as classes do novo shell com
> sidebar que a Task 04 vai usar: `.app-shell` (display flex, altura total), `.app-sidebar`
> (largura fixa ~220px, fundo `var(--color-surface)`, borda direita, display flex column),
> `.sidebar-header` (nome da congregação no topo, com padding e borda inferior),
> `.sidebar-nav` (a lista de seções, flex 1), `.sidebar-nav button` (item de navegação: largura
> total, alinhado à esquerda, sem borda, com estado `.is-active` de fundo azul-claro
> `#e8f0fe` e texto `var(--color-primary-dark)`, e hover sutil), `.sidebar-footer` (rodapé com
> borda superior, onde mora "Sair da congregação" — estilo de botão discreto, texto
> `var(--color-danger)` no hover), e `.app-content` (flex 1, min-width 0, display flex column,
> overflow hidden — é onde as telas renderizam). (3) Adicione também as classes do editor lado a
> lado que a Task 06 vai usar: `.editor-split` (display flex, gap, flex 1, min-height 0),
> `.editor-panel` (largura ~300px, flex column, gap, overflow-y auto) e `.editor-map` (flex 1,
> min-width 0 — o mapa dentro dela deve poder ocupar 100% da altura; ajuste o seletor existente
> `main > div:has(> .leaflet-container)` ou acrescente `.editor-map > .leaflet-container { height:
> 100%; }` conforme necessário). Nenhum arquivo `.tsx` muda nesta task; o CSS novo fica inerte até
> as tasks seguintes usarem as classes. Valide com `npm run lint` e `npm test` (os testes não
> dependem de CSS, devem continuar 318 verdes). Toque apenas `admin/src/renderer/index.css`.

---

### Task 02 — Componente `AssignmentsMap`: demarcações e nome do dirigente

**Objetivo:** O mapa da página de Designações: só contornos de território, rótulo com o nome do
dirigente por cima, clique reportado ao caller.
**Camadas:** Renderer (admin) — componente de mapa
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0006 — Task 02: Crie `admin/src/renderer/map/AssignmentsMap.tsx`, seguindo os padrões de
> `admin/src/renderer/map/TerritoryMap.tsx` (react-leaflet, `MapContainer` + `TileLayer` OSM com
> a mesma URL e attribution, `averageCentroid`, `initialCenter` com `fallbackCenter` e fallback
> Brasília, props `initialView`/`onViewChange` opcionais no mesmo formato). Diferenças em relação
> ao `TerritoryMap`: (1) **não desenha quadras nem números de quadra** — só o polígono de contorno
> de cada território; (2) território **com** `assignedUser` tem contorno sólido
> `#1565c0` (weight 2, fill true com fillOpacity 0.08); território **sem** designação tem contorno
> **tracejado** cinza `#78909c` (`dashArray: '6 6'`, weight 2, fill true com fillOpacity 0.05);
> (3) no centroide médio de cada território vai um `Marker` com `DivIcon` mostrando duas linhas:
> o nome do território (pequeno, semibold) e o nome do dirigente (`assignedUser.name`) ou "Sem
> dirigente" (itálico, cinza) — estilo inline no html do DivIcon, como `numberIcon` faz no
> `TerritoryMap`, com fundo branco translúcido, borda arredondada e sombra leve para ler por cima
> do mapa; (4) clique no polígono **ou** no rótulo chama a prop `onTerritoryTap?: (territory:
> Territory) => void` (use `eventHandlers={{ click: ... }}` nos dois). Interface exportada:
> `AssignmentsMapProps { territories: Territory[]; onTerritoryTap?; fallbackCenter?; initialView?;
> onViewChange? }`. Sem teste próprio — mesmo "risco assumido" do `TerritoryMap`, que também não
> tem; a tela que o usa (Task 03) mocka este componente. Valide com `npm run typecheck` e
> `npm run lint`. Toque apenas `admin/src/renderer/map/AssignmentsMap.tsx`.

---

### Task 03 — `DesignationsScreen`: a página de Designações

**Objetivo:** A tela nova: mapa de demarcações com dirigentes, e clique abrindo o diálogo de
atribuição.
**Camadas:** Renderer (admin) — tela
**Modo:** TDD
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0006 — Task 03: Implemente por TDD: crie
> `admin/src/renderer/screens/DesignationsScreen.tsx` e `DesignationsScreen.test.tsx`. A tela: um
> cabeçalho leve com o título "Designações" e um resumo "N de M territórios designados"; abaixo,
> o `AssignmentsMap` (Task 02) ocupando o resto da área, alimentado por
> `window.api.territories.listWithBlocks()` carregado no mount (mesmo padrão de load/loading/erro
> do `HomeScreen`: estado de carregamento, `role="alert"` com a mensagem de `parseIpcError` em
> falha, e um botão "Recarregar"). Props: `fallbackCenter?: LatLngTuple` (repassada ao mapa).
> Clicar num território (via `onTerritoryTap` do mapa) abre o diálogo de atribuição — **migre o
> comportamento exato do diálogo que hoje vive no `HomeScreen`** (`openAssignDialog`/
> `confirmAssign`, implements/0097): `role="dialog"` com título "Atribuir publicador a {nome}",
> opções de rádio com os publicadores **ativos** (`window.api.publishers.list()` filtrado por
> `isActive`, buscado a cada abertura) mais "Nenhum", pré-selecionando o dirigente atual (ou
> "Nenhum"), botões Cancelar/Atribuir; Atribuir fecha o diálogo imediatamente, chama
> `window.api.territories.assign(territoryId, userId | null)` e recarrega a lista; falha vira
> `role="alert"`. No teste, mocke o `AssignmentsMap` com `vi.mock` (um stub que renderiza um
> botão por território disparando `onTerritoryTap` — interação de mapa real não roda em jsdom).
> Comportamentos a cobrir:
> - Caminho feliz: com territórios carregados, o resumo mostra a contagem certa (ex.: 1 designado
>   de 2) e o mapa recebe todos os territórios.
> - Caminho feliz: tocar um território abre o diálogo com os publicadores ativos + "Nenhum",
>   pré-selecionado no dirigente atual; confirmar chama `assign` com o id escolhido e recarrega.
> - Caminho feliz: escolher "Nenhum" confirma `assign(territoryId, null)`.
> - Erro: `listWithBlocks` rejeita no mount → `role="alert"` + "Recarregar" refaz a busca.
> - Erro: `assign` rejeita → `role="alert"`, sem quebrar a tela.
> - Borda: publicadores desativados não aparecem no diálogo.
> - Borda: cancelar fecha o diálogo sem chamar `assign`.
> Valide com `npm test`, `npm run typecheck`, `npm run lint`. Toque apenas os dois arquivos novos;
> não altere ainda o `HomeScreen` nem o `App.tsx` (Tasks 04/05).

---

### Task 04 — Sidebar: o novo shell de navegação no `App.tsx`

**Objetivo:** A sidebar permanente (Mapa / Designações / Publicadores, congregação no topo, Sair
no rodapé), com as telas renderizando na área de conteúdo.
**Camadas:** Renderer (admin) — App
**Modo:** TDD
**Depende de:** Task 01, Task 03
**Instrução para o subagente:**
> Spec 0006 — Task 04: Implemente por TDD em `admin/src/renderer/App.tsx` e `App.test.tsx`.
> Reestruture `AuthenticatedApp` para o layout de shell: um `<div className="app-shell">` com
> `<nav className="app-sidebar">` fixa à esquerda e `<div className="app-content">` à direita
> onde as rotas renderizam. Na sidebar: `.sidebar-header` com o nome e a cidade da congregação
> (ou "Territory Map" quando `congregation` é null); `.sidebar-nav` com três botões — "Mapa",
> "Designações", "Publicadores" — que trocam a rota (o ativo ganha a classe `is-active` e
> `aria-current="page"`); `.sidebar-footer` com o botão "Sair da congregação", que usa o mesmo
> `window.confirm` com a mensagem literal que hoje está em `SIGN_OUT_CONFIRM_MESSAGE` no
> `HomeScreen.tsx` (copie a constante para o App.tsx), e em confirmação chama
> `window.api.session.signOut()` e `onSignedOut()`; falha vira `role="alert"` na área de
> conteúdo. Rotas: `home` renderiza `HomeScreen` (sem passar mais `onOpenPublishers`/`onSignedOut`
> — os props são opcionais, então o HomeScreen atual continua compilando; a remoção deles é a
> Task 05); `designations` renderiza a `DesignationsScreen` (Task 03) com o `fallbackCenter` já
> existente; `publishers` renderiza `PublishersScreen`. As telas empurradas (editores e
> histórico) continuam com o `PushedScreen`/"← Voltar", mas renderizadas **dentro** de
> `.app-content` (a sidebar permanece visível); o Voltar continua voltando para a Home. Preserve
> `mapView` e `fallbackCenter` exatamente como estão (nível de `AuthenticatedApp`). Comportamentos
> a cobrir (adapte os testes existentes de `App.test.tsx` que dependiam dos botões do header da
> Home — ex. navegação para Publicadores — para o novo caminho pela sidebar):
> - A sidebar aparece com as três seções e o nome da congregação; "Mapa" é a seção inicial ativa.
> - Clicar "Designações" mostra a `DesignationsScreen`; clicar "Publicadores" mostra a
>   `PublishersScreen`; clicar "Mapa" volta à Home.
> - "Sair da congregação" com confirmação aceita chama `signOut` e leva de volta ao Setup; com
>   confirmação recusada não chama nada.
> - Abrir um editor a partir da Home continua funcionando, com o "← Voltar" retornando à Home
>   (testes de navegação existentes adaptados, não removidos).
> Valide com `npm test`, `npm run typecheck`, `npm run lint`. Toque apenas `App.tsx` e
> `App.test.tsx`; se precisar mockar a `DesignationsScreen` pesada no teste do App, prefira usar
> a real com os fakes de `window.api` já usados no arquivo.

---

### Task 05 — `HomeScreen` enxuta: sem header duplicado e sem diálogo de atribuição

**Objetivo:** A Home vira só mapa + lista de territórios: navegação e sign-out agora são da
sidebar, e a designação é da página própria.
**Camadas:** Renderer (admin) — tela
**Modo:** TDD
**Depende de:** Task 04
**Instrução para o subagente:**
> Spec 0006 — Task 05: Implemente por TDD em `admin/src/renderer/screens/HomeScreen.tsx` e
> `HomeScreen.test.tsx`. Remova da tela: o botão "Publicadores", o botão/menu "Mais opções" com
> "Sair da congregação" (e a constante `SIGN_OUT_CONFIRM_MESSAGE`, que a Task 04 já copiou para o
> App), os props `onOpenPublishers`/`onSignedOut`, o item "Atribuir a publicador em X" do menu
> "⋮", e todo o diálogo de atribuição (`assignTarget`/`assignPublishers`/`selectedPublisherId`/
> `openAssignDialog`/`confirmAssign`) — a designação agora vive na `DesignationsScreen`
> (Task 03). O header da Home fica: título da congregação e o botão "Recarregar". **Mantém**: a
> indicação "Designado a {nome}" na linha do território (informativa), o menu "⋮" com exatamente
> três itens (Adicionar quadra, Editar demarcação, Apagar território), o modal de ações da quadra,
> e todo o resto. Comportamentos a cobrir (a maioria é adaptação dos testes existentes — remova os
> casos do diálogo de atribuição daqui, eles já foram recriados na Task 03):
> - O menu "⋮" de um território mostra exatamente as três ações restantes, e cada uma continua
>   funcionando.
> - A linha do território ainda mostra "Designado a {nome}" quando há dirigente.
> - Não existe mais botão "Publicadores" nem menu "Mais opções" na tela.
> - Carregamento, erro com Recarregar, apagar território/quadra, e o modal da quadra continuam
>   como antes (testes existentes seguem passando, adaptados aos props removidos).
> Confira com `npx tsc --noEmit`/`npm run typecheck` que nenhum outro arquivo referencia os props
> removidos (o App.tsx da Task 04 já parou de passá-los). Valide com `npm test`,
> `npm run typecheck`, `npm run lint`. Toque apenas `HomeScreen.tsx` e `HomeScreen.test.tsx`.

---

### Task 06 — Editor de quadras: layout lado a lado e sequência automática de número

**Objetivo:** Desenhar várias quadras em sequência fica fluido: mapa grande, painel lateral, e o
número seguinte já sugerido a cada salvamento.
**Camadas:** Renderer (admin) — tela
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0006 — Task 06: Implemente por TDD em `admin/src/renderer/screens/BlockEditorScreen.tsx` e
> `BlockEditorScreen.test.tsx`. Duas mudanças: (1) **Layout**: reorganize o JSX para o split da
> Task 01 — `<div className="editor-split">` contendo `<div className="editor-panel">` (título,
> confirmação `role="status"`, toolbar Desfazer/Apagar tudo/Salvar, campo do número com as
> mensagens, `role="alert"` de erro, e a dica do editor) e `<div className="editor-map">` com o
> `MapContainer` ocupando toda a altura disponível (remova o wrapper de `height: '480px'`). Não
> mude nenhum comportamento nesta parte — os testes existentes devem continuar passando sem
> alteração de expectativa (eles consultam por role/label, não por posição). (2) **Sequência de
> número**: hoje, depois de um salvamento bem-sucedido, `numberText` reseta para `''`. Mude para:
> depois de um salvamento **em modo de criação**, `numberText` passa a ser `String(saved.number +
> 1)` — o próximo da sequência, editável e apagável como qualquer valor digitado; depois de um
> salvamento **em modo de edição** (que volta a tela para criação), `numberText` reseta para `''`
> como hoje (sugerir "número editado + 1" colidiria com quadras já existentes). Comportamentos a
> cobrir com teste:
> - Caminho feliz: salvar uma quadra nova (servidor devolve number 7) deixa o campo com "8" e a
>   tela pronta para desenhar a próxima; salvar de novo envia `number: 8`.
> - Caminho feliz: o admin pode apagar a sugestão e salvar com o campo em branco — o servidor
>   escolhe o número, como hoje.
> - Borda: salvar uma **edição** de quadra existente volta o campo para vazio, não para
>   "editado + 1".
> - Regressão guardada: os comportamentos da spec 0004 (tela permanece montada após salvar,
>   contexto com as quadras da sessão, confirmação temporária) continuam cobertos pelos testes
>   existentes, que devem seguir verdes.
> Valide com `npm test`, `npm run typecheck`, `npm run lint`. Toque apenas
> `BlockEditorScreen.tsx` e `BlockEditorScreen.test.tsx`.

---

### Task 07 — Publicadores: busca por nome e contadores

**Objetivo:** Gestão de usuários mais usável quando a lista cresce: filtrar por nome e ver o
resumo da situação.
**Camadas:** Renderer (admin) — tela
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0006 — Task 07: Implemente por TDD em `admin/src/renderer/screens/PublishersScreen.tsx` e
> `PublishersScreen.test.tsx`. Duas adições, sem remover nada do que existe: (1) **Busca**: um
> campo de texto (com `aria-label="Buscar publicador"` e placeholder "Buscar por nome…") acima da
> lista, que filtra as linhas por nome conforme se digita — comparação sem diferenciar
> maiúsculas/acentos (use `localeCompare`/normalização com `sensitivity: 'base'`, ou
> `String.prototype.normalize('NFD')` removendo diacríticos; "joao" encontra "João"). Com o filtro
> ativo e nenhum resultado, mostrar "Nenhum publicador encontrado para a busca." em vez de lista
> vazia silenciosa. O campo só aparece quando a lista carregou sem erro e tem pelo menos um
> publicador. (2) **Contadores**: uma linha de resumo junto ao título (ex.: "3 ativos · 1 com
> código válido · 1 desativado") derivada dos mesmos predicados que a tela já usa
> (`statusCategory`); categorias zeradas ficam de fora do texto. Comportamentos a cobrir:
> - Caminho feliz: digitar parte de um nome filtra a lista para os que casam; limpar o campo
>   mostra todos de novo.
> - Borda: busca ignora caixa e acento ("joao" encontra "João").
> - Borda: busca sem resultado mostra a mensagem própria, não a de "nenhum cadastrado".
> - Caminho feliz: o resumo conta as categorias certas para uma lista mista, omitindo as zeradas.
> - Regressão: criar publicador, gerar código, ativar/desativar e o diálogo do código continuam
>   passando nos testes existentes.
> Valide com `npm test`, `npm run typecheck`, `npm run lint`. Toque apenas
> `PublishersScreen.tsx` e `PublishersScreen.test.tsx`; ajustes visuais pequenos (o campo de
> busca) podem ir em `admin/src/renderer/index.css` seguindo as classes existentes.

---

### Task 08 — Passada final de consistência, build e documentação

**Objetivo:** O conjunto fecha como um produto só: visual coerente nas telas restantes, suíte
inteira verde, build empacotável e `AGENTS.md` refletindo o admin novo.
**Camadas:** Renderer (admin) + documentação
**Modo:** direto
**Depende de:** Task 01, Task 02, Task 03, Task 04, Task 05, Task 06, Task 07
**Instrução para o subagente:**
> Spec 0006 — Task 08: Com todas as tasks anteriores concluídas: (1) faça uma passada de
> consistência visual nos pontos que as tasks não cobriram — `TerritoryEditorScreen` e
> `BlockHistorySheet` dentro do novo shell (espaçamentos, títulos, sem header duplicado
> conflitando com a sidebar), o `.back-bar` do `PushedScreen` alinhado ao novo visual, e qualquer
> resíduo de verde ou de CSS morto em `admin/src/renderer/index.css` (ex.: regras do antigo menu
> "Mais opções" se ficaram órfãs). Mudanças aqui são só de CSS/markup sem comportamento — se
> encontrar algo que exigiria mudar comportamento, registre em vez de mudar. (2) Rode a validação
> completa do admin: `npm test` (suíte inteira verde), `npm run typecheck`, `npm run lint`,
> `npm run build` (compila). (3) Atualize o `AGENTS.md` na seção que descreve o admin: a navegação
> agora é por sidebar (Mapa / Designações / Publicadores / Sair), existe a tela de Designações
> (mapa de demarcações sem quadras, nome do dirigente sobreposto, clique edita a designação — os
> canais IPC são os mesmos da spec 0005), o editor de quadras é lado a lado com sequência de
> numeração, e a lista de telas cobertas por teste mudou de "seis telas" para o número real. (4)
> Registre no README desta implementação que o empacotamento (`npm run build:mac` etc.) continua
> manual e fora do escopo. Toque apenas arquivos de `admin/src/renderer/` (CSS/markup sem
> comportamento) e `AGENTS.md`.

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0006
```

Ondas naturais: Tasks 01 e 02 em paralelo; Task 03 depois da 02; Tasks 06 e 07 podem rodar em
paralelo com a 03 (dependem só da 01); Task 04 depois da 01+03; Task 05 depois da 04; Task 08 por
último. **Atenção do orquestrador:** as Tasks 04 e 05 tocam pares de arquivos disjuntos
(`App.tsx`/`App.test.tsx` vs `HomeScreen.tsx`/`HomeScreen.test.tsx`) mas são acopladas em
sequência — não as rode em paralelo.

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo`
da task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task ao iniciar a primeira task, ou pelo
  `/centaur-driven-run` ao montar o plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou
`/centaur-driven-implement`)._

- [x] Task 01 — CSS: primária azul e estilos do shell com sidebar → implements/0104
- [x] Task 02 — Componente `AssignmentsMap`: demarcações e nome do dirigente → implements/0103
- [x] Task 03 — `DesignationsScreen`: a página de Designações → implements/0107
- [x] Task 04 — Sidebar: o novo shell de navegação no `App.tsx` → implements/0108
- [x] Task 05 — `HomeScreen` enxuta: sem header duplicado e sem diálogo de atribuição → implements/0109
- [x] Task 06 — Editor de quadras: layout lado a lado e sequência automática de número → implements/0105
- [x] Task 07 — Publicadores: busca por nome e contadores → implements/0106
- [x] Task 08 — Passada final de consistência, build e documentação → implements/0111
